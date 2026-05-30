import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";

/**
 * POST /api/games/crash/bet
 * Body: { roundId, betCents, autoCashoutAt? }
 *
 * Places a bet on the next Crash round. Only allowed while the round is
 * still in its 5-sec betting window (now < start_at).
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    roundId?: string;
    betCents?: number;
    autoCashoutAt?: number;
  };
  if (!body.roundId || !body.betCents) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (body.betCents < MIN_BET_CENTS) {
    return NextResponse.json({ error: "bet below minimum" }, { status: 400 });
  }
  if (body.betCents > MAX_BET_CENTS) {
    return NextResponse.json({ error: "bet exceeds maximum" }, { status: 400 });
  }
  if (
    body.autoCashoutAt !== undefined &&
    (body.autoCashoutAt < 1.01 || body.autoCashoutAt > 1000)
  ) {
    return NextResponse.json(
      { error: "auto-cashout must be between 1.01x and 1000x" },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();

  const { data: round, error: roundErr } = await supabase
    .from("crash_rounds")
    .select("id, lobby_id, start_at, crashed_at")
    .eq("id", body.roundId)
    .single();
  if (roundErr || !round) {
    return NextResponse.json({ error: "round not found" }, { status: 404 });
  }
  if (new Date(round.start_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "betting window closed" },
      { status: 409 }
    );
  }

  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted")
    .eq("lobby_id", round.lobby_id)
    .eq("nickname", identifier)
    .single();
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }
  if (seat.is_busted) {
    return NextResponse.json({ error: "busted" }, { status: 409 });
  }

  // Atomic deduct
  const { data: newBal, error: deductErr } = await supabase.rpc(
    "deduct_balance",
    { p_player_id: seat.id, p_amount_cents: body.betCents }
  );
  if (deductErr) {
    return NextResponse.json({ error: deductErr.message }, { status: 500 });
  }
  if (newBal === null || newBal === undefined) {
    return NextResponse.json(
      { error: "insufficient balance" },
      { status: 409 }
    );
  }

  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .insert({
      lobby_id: round.lobby_id,
      lobby_player_id: seat.id,
      game: "crash",
      bet_amount_cents: body.betCents,
      payout_cents: 0,
      details: {
        roundId: round.id,
        autoCashoutAt: body.autoCashoutAt ?? null,
        status: "active",
      },
    })
    .select("id")
    .single();
  if (betErr || !bet) {
    return NextResponse.json(
      { error: betErr?.message ?? "could not place bet" },
      { status: 500 }
    );
  }

  // Broadcast balance update so the leaderboard reacts immediately
  await import("@/lib/realtime/pusher-server").then(({ publishLobby }) =>
    publishLobby(round.lobby_id, {
      type: "balance_update",
      lobbyPlayerId: seat.id,
      balanceCents: newBal as number,
    })
  );

  return NextResponse.json({
    betId: bet.id,
    newBalanceCents: newBal as number,
  });
}
