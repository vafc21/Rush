import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import {
  drawNumbers,
  multiplierFor,
  MIN_PICKS,
  MAX_PICKS,
  POOL_SIZE,
} from "@/lib/games/keno";
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
    picks?: number[];
  };
  if (!body.lobbyId || !body.betCents || !Array.isArray(body.picks)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (body.picks.length < MIN_PICKS || body.picks.length > MAX_PICKS) {
    return NextResponse.json(
      { error: `pick between ${MIN_PICKS} and ${MAX_PICKS} numbers` },
      { status: 400 }
    );
  }
  // Validate picks: each in [1, POOL_SIZE], distinct
  const seen = new Set<number>();
  for (const p of body.picks) {
    if (!Number.isInteger(p) || p < 1 || p > POOL_SIZE) {
      return NextResponse.json({ error: "invalid pick" }, { status: 400 });
    }
    if (seen.has(p)) {
      return NextResponse.json({ error: "duplicate pick" }, { status: 400 });
    }
    seen.add(p);
  }
  if (body.betCents < MIN_BET_CENTS) {
    return NextResponse.json({ error: "bet below minimum" }, { status: 400 });
  }
  if (body.betCents > MAX_BET_CENTS) {
    return NextResponse.json({ error: "bet exceeds maximum" }, { status: 400 });
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

  const drawn = drawNumbers();
  const drawnSet = new Set(drawn);
  const matched = body.picks.filter((p) => drawnSet.has(p));
  const multiplier = multiplierFor(body.picks.length, matched.length);
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
    game: "keno",
    bet_amount_cents: body.betCents,
    payout_cents: payoutCents,
    details: {
      picks: body.picks,
      drawn,
      matched,
      multiplier,
    },
  });

  await publishLobby(seat.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: seat.id,
    balanceCents: finalBalance,
  });

  await maybeBustPlayer(seat.lobby_id, seat.id, finalBalance);

  return NextResponse.json({
    drawn,
    matched,
    multiplier,
    payoutCents,
    newBalanceCents: finalBalance,
  });
}
