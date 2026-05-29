import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";

const WHEEL_SEGMENTS = 50;
const REBUY_CENTS = 50_000; // $500

/**
 * Last Chance Wheel spin. Only available when the requesting player is
 * busted in this lobby. 1-in-50 chance of landing on the gold segment,
 * which restores their balance to $500 and clears the busted flag.
 *
 * Server returns the `landedSegment` (0..WHEEL_SEGMENTS-1) so the client
 * can animate the wheel to that position regardless of outcome.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
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

  // The lobby must still be active — no rebuying after the round ends.
  const { data: lobby } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .single();
  if (!lobby || lobby.status !== "active") {
    return NextResponse.json({ error: "round over" }, { status: 409 });
  }

  // Pick the winning segment (always 0 for visual consistency — we just
  // tell the client what segment they landed on).
  const WINNING_SEGMENT = 0;
  const landedSegment = randomInt(0, WHEEL_SEGMENTS);
  const won = landedSegment === WINNING_SEGMENT;

  if (won) {
    // Set balance to REBUY_CENTS and clear busted flag.
    await supabase
      .from("lobby_players")
      .update({ balance_cents: REBUY_CENTS, is_busted: false })
      .eq("id", seat.id);

    // Record the win as a bet for stats (so the trajectory shows the spike)
    await supabase.from("bets").insert({
      lobby_id: lobbyId,
      lobby_player_id: seat.id,
      game: "last_chance_wheel",
      bet_amount_cents: 0,
      payout_cents: REBUY_CENTS,
      details: { landedSegment, won: true },
    });

    await publishLobby(lobbyId, {
      type: "balance_update",
      lobbyPlayerId: seat.id,
      balanceCents: REBUY_CENTS,
    });
  } else {
    // Record the spin too so trajectory shows the activity
    await supabase.from("bets").insert({
      lobby_id: lobbyId,
      lobby_player_id: seat.id,
      game: "last_chance_wheel",
      bet_amount_cents: 0,
      payout_cents: 0,
      details: { landedSegment, won: false },
    });
  }

  return NextResponse.json({
    won,
    landedSegment,
    winningSegment: WINNING_SEGMENT,
    segments: WHEEL_SEGMENTS,
    rebuyCents: REBUY_CENTS,
  });
}
