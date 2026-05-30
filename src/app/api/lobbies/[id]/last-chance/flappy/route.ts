import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";

/**
 * POST /api/lobbies/[id]/last-chance/flappy
 * Body: { pipes }
 *
 * Player-reported number of pipes survived in a Flappy run. Server
 * computes the banked cents using the spec'd doubling-multiplier rule
 * (multiplier doubles every 10 pipes: 1× / 2× / 4× / 8× / ...).
 *
 * The client is the source of truth on the score — this is a teen game
 * with no real money, so we accept the run-length as reported. If we
 * cared about cheating later, we'd timestamp the run start in a separate
 * `start` endpoint and validate min/max possible pipes from elapsed time.
 *
 * Caps:
 *   - Anything above MAX_PIPES is clamped (defense against integer
 *     overflow if someone POSTs absurd numbers).
 *   - You must be busted to flap. Successful banking that brings you
 *     above the minimum bet ($1) clears the busted flag.
 */

const BASE_CENTS_PER_PIPE = 1;
const PIPES_PER_DOUBLING = 10;
const MAX_PIPES = 200;

function bankedFor(pipes: number): number {
  if (pipes <= 0) return 0;
  let cents = 0;
  for (let i = 0; i < Math.min(pipes, MAX_PIPES); i++) {
    const tier = Math.floor(i / PIPES_PER_DOUBLING);
    cents += BASE_CENTS_PER_PIPE * Math.pow(2, tier);
  }
  return cents;
}

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
  const body = (await req.json().catch(() => ({}))) as { pipes?: number };
  if (typeof body.pipes !== "number" || body.pipes < 0) {
    return NextResponse.json({ error: "invalid pipes" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted, balance_cents")
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

  const banked = bankedFor(body.pipes);

  await supabase.from("bets").insert({
    lobby_id: lobbyId,
    lobby_player_id: seat.id,
    game: "flappy",
    bet_amount_cents: 0,
    payout_cents: banked,
    details: { pipes: Math.min(body.pipes, MAX_PIPES) },
  });

  if (banked > 0) {
    const { data: newBal } = await supabase.rpc("credit_balance", {
      p_player_id: seat.id,
      p_amount_cents: banked,
    });
    const finalBalance = (newBal as number) ?? seat.balance_cents + banked;
    // Clear busted flag if banking brought us above min bet
    if (finalBalance >= 100) {
      await supabase
        .from("lobby_players")
        .update({ is_busted: false })
        .eq("id", seat.id);
    }
    await publishLobby(lobbyId, {
      type: "balance_update",
      lobbyPlayerId: seat.id,
      balanceCents: finalBalance,
    });
    return NextResponse.json({ banked, newBalanceCents: finalBalance });
  }

  return NextResponse.json({ banked: 0 });
}
