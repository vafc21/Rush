import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { lobbyIsActive } from "@/lib/lobby/active";
import { dropBall, multiplierFor, Risk } from "@/lib/games/plinko";
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

  const body = (await req.json().catch(() => ({}))) as {
    lobbyId?: string;
    betCents?: number;
    risk?: Risk;
  };
  if (!body.lobbyId || !body.betCents || !body.risk) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!["low", "medium", "high"].includes(body.risk)) {
    return NextResponse.json({ error: "invalid risk" }, { status: 400 });
  }
  if (body.betCents < MIN_BET_CENTS) {
    return NextResponse.json({ error: "bet below minimum" }, { status: 400 });
  }
  if (body.betCents > MAX_BET_CENTS) {
    return NextResponse.json({ error: "bet exceeds maximum" }, { status: 400 });
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
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }
  if (seat.is_busted) {
    return NextResponse.json({ error: "busted" }, { status: 409 });
  }

  const { data: afterDeduct, error: dedErr } = await supabase.rpc(
    "deduct_balance",
    { p_player_id: seat.id, p_amount_cents: body.betCents }
  );
  if (dedErr) {
    return NextResponse.json({ error: dedErr.message }, { status: 500 });
  }
  if (afterDeduct === null || afterDeduct === undefined) {
    return NextResponse.json({ error: "insufficient balance" }, { status: 409 });
  }

  const { path, slot } = dropBall();
  const multiplier = multiplierFor(body.risk, slot);
  const payoutCents = Math.floor(body.betCents * multiplier);

  let finalBalance = afterDeduct as number;
  if (payoutCents > 0) {
    const { data: bumped, error: bumpErr } = await supabase.rpc(
      "credit_balance",
      { p_player_id: seat.id, p_amount_cents: payoutCents }
    );
    if (bumpErr) {
      return NextResponse.json({ error: bumpErr.message }, { status: 500 });
    }
    finalBalance = bumped as number;
  }

  await supabase.from("bets").insert({
    lobby_id: seat.lobby_id,
    lobby_player_id: seat.id,
    game: "plinko",
    bet_amount_cents: body.betCents,
    payout_cents: payoutCents,
    details: { risk: body.risk, path, slot, multiplier },
  });

  await publishLobby(seat.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: seat.id,
    balanceCents: finalBalance,
  });

  await maybeBustPlayer(seat.lobby_id, seat.id, finalBalance);

  return NextResponse.json({
    risk: body.risk,
    path,
    slot,
    multiplier,
    payoutCents,
    newBalanceCents: finalBalance,
  });
}
