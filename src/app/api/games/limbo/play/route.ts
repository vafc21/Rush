import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { rollCrashPoint } from "@/lib/games/crash";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { maybeBustPlayer } from "@/lib/games/bust";

/**
 * Limbo is mechanically a single Crash round where the player commits
 * to a target multiplier before the roll. If the rolled crash point ≥
 * target, the player wins at `betCents × target`. Otherwise they lose.
 * RTP = 99% (same house edge as the Crash distribution).
 */

const MIN_TARGET = 1.01;
const MAX_TARGET = 1000;

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
    targetMultiplier?: number;
  };
  if (!body.lobbyId || !body.betCents || typeof body.targetMultiplier !== "number") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (body.betCents < MIN_BET_CENTS) {
    return NextResponse.json({ error: "bet below minimum" }, { status: 400 });
  }
  if (body.betCents > MAX_BET_CENTS) {
    return NextResponse.json({ error: "bet exceeds maximum" }, { status: 400 });
  }
  if (body.targetMultiplier < MIN_TARGET || body.targetMultiplier > MAX_TARGET) {
    return NextResponse.json(
      { error: `target must be between ${MIN_TARGET}x and ${MAX_TARGET}x` },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();
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

  // Atomic deduct
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

  const rolledCrashPoint = rollCrashPoint();
  const won = rolledCrashPoint >= body.targetMultiplier;
  const payoutCents = won ? Math.floor(body.betCents * body.targetMultiplier) : 0;

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
    game: "limbo",
    bet_amount_cents: body.betCents,
    payout_cents: payoutCents,
    details: {
      targetMultiplier: body.targetMultiplier,
      rolledCrashPoint,
      won,
    },
  });

  await publishLobby(seat.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: seat.id,
    balanceCents: finalBalance,
  });

  await maybeBustPlayer(seat.lobby_id, seat.id, finalBalance);

  return NextResponse.json({
    won,
    targetMultiplier: body.targetMultiplier,
    rolledCrashPoint,
    payoutCents,
    newBalanceCents: finalBalance,
  });
}
