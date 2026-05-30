import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import {
  multiplierAtElapsed,
  secondsToReachMultiplier,
} from "@/lib/games/crash";
import { publishLobby } from "@/lib/realtime/pusher-server";

/**
 * POST /api/games/crash/cashout
 * Body: { betId, multiplier }
 *
 * `multiplier` is what the client thinks the round is at. The server
 * recomputes the multiplier from its own clock (now - start_at) and
 * accepts the lower of the two (so the client can't claim a higher
 * cashout than time allows). The server also rejects if the round has
 * already crashed.
 */

// Tolerance for client/server clock drift in milliseconds.
const CASHOUT_GRACE_MS = 250;

type CrashBetDetails = {
  roundId: string;
  autoCashoutAt: number | null;
  status: "active" | "cashed_out" | "lost";
  cashedAt?: number;
};

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    betId?: string;
    multiplier?: number;
  };
  if (!body.betId || typeof body.multiplier !== "number" || body.multiplier < 1) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, bet_amount_cents, details, game")
    .eq("id", body.betId)
    .single();
  if (betErr || !bet) {
    return NextResponse.json({ error: "bet not found" }, { status: 404 });
  }
  if (bet.game !== "crash") {
    return NextResponse.json({ error: "wrong game" }, { status: 400 });
  }

  const details = bet.details as CrashBetDetails;
  if (details.status !== "active") {
    return NextResponse.json({ error: "already resolved" }, { status: 409 });
  }

  const identifier =
    session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id")
    .eq("lobby_id", bet.lobby_id)
    .eq("nickname", identifier)
    .single();
  if (!seat || seat.id !== bet.lobby_player_id) {
    return NextResponse.json({ error: "not your bet" }, { status: 403 });
  }

  const { data: round } = await supabase
    .from("crash_rounds")
    .select("id, start_at, crash_multiplier, crashed_at")
    .eq("id", details.roundId)
    .single();
  if (!round) {
    return NextResponse.json({ error: "round missing" }, { status: 404 });
  }

  const now = Date.now();
  const startMs = new Date(round.start_at).getTime();
  if (now < startMs) {
    return NextResponse.json({ error: "round not started" }, { status: 409 });
  }
  const elapsedSec = (now - startMs) / 1000;
  // Server-side multiplier at the moment the request arrived
  const serverMultiplier = multiplierAtElapsed(elapsedSec);

  const crashMultiplier = Number(round.crash_multiplier);
  const crashElapsedSec = secondsToReachMultiplier(crashMultiplier);
  const crashedAtMs = startMs + crashElapsedSec * 1000;

  if (now > crashedAtMs + CASHOUT_GRACE_MS) {
    // Too late — the rocket already crashed.
    const nextDetails: CrashBetDetails = { ...details, status: "lost" };
    await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    return NextResponse.json(
      { error: "already crashed", crashAt: crashMultiplier },
      { status: 409 }
    );
  }

  // Accept the smaller of client/server multiplier, capped by crashAt.
  const acceptedMultiplier = Math.min(
    body.multiplier,
    serverMultiplier,
    crashMultiplier
  );
  const payoutCents = Math.floor(bet.bet_amount_cents * acceptedMultiplier);

  const { data: newBal, error: creditErr } = await supabase.rpc("credit_balance", {
    p_player_id: seat.id,
    p_amount_cents: payoutCents,
  });
  if (creditErr) {
    return NextResponse.json({ error: creditErr.message }, { status: 500 });
  }

  const nextDetails: CrashBetDetails = {
    ...details,
    status: "cashed_out",
    cashedAt: acceptedMultiplier,
  };
  await supabase
    .from("bets")
    .update({ payout_cents: payoutCents, details: nextDetails })
    .eq("id", bet.id);

  // Tell everyone — leaderboard reacts, plus the crash UI can show the
  // floating "<nick> cashed at 2.4x" notification.
  await publishLobby(bet.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: seat.id,
    balanceCents: newBal as number,
  });
  await publishLobby(bet.lobby_id, {
    type: "crash_cashout",
    lobbyPlayerId: seat.id,
    multiplier: acceptedMultiplier,
    payoutCents,
  });

  return NextResponse.json({
    multiplier: acceptedMultiplier,
    payoutCents,
    newBalanceCents: newBal as number,
  });
}
