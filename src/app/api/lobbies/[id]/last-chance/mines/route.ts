import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import {
  MINES_COOLDOWN_MS,
  lastChanceCooldownRemaining,
} from "@/lib/games/lastChance";

const TILES = 25;
const REBUY_CENTS = 50_000; // $500

/**
 * POST /api/lobbies/[id]/last-chance/mines
 * Body: { tileIndex }
 *
 * One-click 1-safe-tile-in-25 Mines variant for busted players.
 * 4% chance of $500 rebuy. The server picks the safe tile per call and
 * just tells the client what was picked + what they clicked.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { tileIndex?: number };
  if (
    typeof body.tileIndex !== "number" ||
    body.tileIndex < 0 ||
    body.tileIndex >= TILES
  ) {
    return NextResponse.json({ error: "invalid tile" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted")
    .eq("lobby_id", lobbyId)
    .eq("nickname", identifier)
    .single();
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }
  if (!seat.is_busted) {
    return NextResponse.json({ error: "not busted" }, { status: 409 });
  }

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .single();
  if (!lobby || lobby.status !== "active") {
    return NextResponse.json({ error: "round over" }, { status: 409 });
  }

  // Authoritative cooldown — the client cooldown is wiped if the player
  // remounts the widget (switching Last Chance sub-tabs), so picks must be
  // rate-limited here or they could be spammed until the rebuy lands.
  const remainingMs = await lastChanceCooldownRemaining(
    supabase,
    lobbyId,
    seat.id,
    "last_chance_mines",
    MINES_COOLDOWN_MS
  );
  if (remainingMs > 0) {
    return NextResponse.json(
      { error: "cooldown", retryAfterMs: remainingMs },
      { status: 429 }
    );
  }

  const safeTile = randomInt(0, TILES);
  const won = body.tileIndex === safeTile;

  // Record as a bet so the trajectory shows the attempt
  await supabase.from("bets").insert({
    lobby_id: lobbyId,
    lobby_player_id: seat.id,
    game: "last_chance_mines",
    bet_amount_cents: 0,
    payout_cents: won ? REBUY_CENTS : 0,
    details: { safeTile, clicked: body.tileIndex, won },
  });

  if (won) {
    await supabase
      .from("lobby_players")
      .update({ balance_cents: REBUY_CENTS, is_busted: false })
      .eq("id", seat.id);
    await publishLobby(lobbyId, {
      type: "balance_update",
      lobbyPlayerId: seat.id,
      balanceCents: REBUY_CENTS,
    });
  }

  return NextResponse.json({
    won,
    safeTile,
    rebuyCents: REBUY_CENTS,
  });
}
