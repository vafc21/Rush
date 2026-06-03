import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { lobbyIsActive } from "@/lib/lobby/active";
import { deal } from "@/lib/games/diamonds";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { maybeBustPlayer } from "@/lib/games/bust";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }
  const body = (await req.json().catch(() => ({}))) as { lobbyId?: string; betCents?: number };
  if (!body.lobbyId || !body.betCents) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (body.betCents < MIN_BET_CENTS || body.betCents > MAX_BET_CENTS) {
    return NextResponse.json({ error: "bet out of range" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Only place bets while the round is live — not in the waiting room
  // (pre-round balance padding) or after it has ended.
  if (!(await lobbyIsActive(supabase, body.lobbyId))) {
    return NextResponse.json({ error: "round not active" }, { status: 409 });
  }
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted, lobby_id")
    .eq("lobby_id", body.lobbyId)
    .eq("nickname", identifier)
    .single();
  if (!seat) return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  if (seat.is_busted) return NextResponse.json({ error: "busted" }, { status: 409 });

  const { data: afterDeduct, error: dedErr } = await supabase.rpc("deduct_balance", {
    p_player_id: seat.id,
    p_amount_cents: body.betCents,
  });
  if (dedErr) return NextResponse.json({ error: dedErr.message }, { status: 500 });
  if (afterDeduct === null) return NextResponse.json({ error: "insufficient balance" }, { status: 409 });

  const result = deal();
  const payoutCents = Math.floor(body.betCents * result.multiplier);
  let finalBalance = afterDeduct as number;
  if (payoutCents > 0) {
    const { data: bumped } = await supabase.rpc("credit_balance", {
      p_player_id: seat.id,
      p_amount_cents: payoutCents,
    });
    finalBalance = bumped as number;
  }
  await supabase.from("bets").insert({
    lobby_id: seat.lobby_id,
    lobby_player_id: seat.id,
    game: "diamonds",
    bet_amount_cents: body.betCents,
    payout_cents: payoutCents,
    details: { hand: result.hand, multiplier: result.multiplier, cluster: result.cluster ?? null },
  });
  await publishLobby(seat.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: seat.id,
    balanceCents: finalBalance,
  });
  await maybeBustPlayer(seat.lobby_id, seat.id, finalBalance);
  return NextResponse.json({
    hand: result.hand,
    multiplier: result.multiplier,
    cluster: result.cluster ?? null,
    payoutCents,
    newBalanceCents: finalBalance,
  });
}
