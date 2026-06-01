import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { spinRoulette, settle, colorOf, Bet } from "@/lib/games/roulette";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { maybeBustPlayer } from "@/lib/games/bust";

/**
 * Body: { lobbyId, bets: { bet: Bet, amountCents: number }[] }
 * Each bet costs amountCents; total deduction = sum of all amounts.
 * Server spins once, settles each bet, credits total winnings.
 */

function validateBet(b: Bet): boolean {
  switch (b.kind) {
    case "single":
      return Number.isInteger(b.n) && b.n >= 0 && b.n <= 36;
    case "color":
      return b.color === "red" || b.color === "black";
    case "parity":
      return b.parity === "odd" || b.parity === "even";
    case "half":
      return b.half === "low" || b.half === "high";
    case "dozen":
      return [1, 2, 3].includes(b.dozen);
    case "column":
      return [1, 2, 3].includes(b.column);
  }
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }
  const body = (await req.json().catch(() => ({}))) as {
    lobbyId?: string;
    bets?: Array<{ bet: Bet; amountCents: number }>;
  };
  if (!body.lobbyId || !Array.isArray(body.bets) || body.bets.length === 0) {
    return NextResponse.json({ error: "no bets" }, { status: 400 });
  }
  let total = 0;
  for (const b of body.bets) {
    if (!validateBet(b.bet)) {
      return NextResponse.json({ error: "invalid bet" }, { status: 400 });
    }
    if (!Number.isInteger(b.amountCents) || b.amountCents < 100) {
      return NextResponse.json({ error: "bet < $1" }, { status: 400 });
    }
    total += b.amountCents;
  }
  if (total < MIN_BET_CENTS || total > MAX_BET_CENTS) {
    return NextResponse.json(
      { error: `total bets must be $${MIN_BET_CENTS / 100}-$${MAX_BET_CENTS / 100}` },
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
  if (!seat) return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  if (seat.is_busted) return NextResponse.json({ error: "busted" }, { status: 409 });

  const { data: afterDeduct, error: dedErr } = await supabase.rpc("deduct_balance", {
    p_player_id: seat.id,
    p_amount_cents: total,
  });
  if (dedErr) return NextResponse.json({ error: dedErr.message }, { status: 500 });
  if (afterDeduct === null) return NextResponse.json({ error: "insufficient balance" }, { status: 409 });

  const n = spinRoulette();
  const results = body.bets.map((b) => {
    const multi = settle(b.bet, n);
    return { bet: b.bet, amountCents: b.amountCents, multi, payout: b.amountCents * multi };
  });
  const totalPayout = results.reduce((s, r) => s + r.payout, 0);

  let finalBalance = afterDeduct as number;
  if (totalPayout > 0) {
    const { data: bumped } = await supabase.rpc("credit_balance", {
      p_player_id: seat.id,
      p_amount_cents: totalPayout,
    });
    finalBalance = bumped as number;
  }

  await supabase.from("bets").insert({
    lobby_id: seat.lobby_id,
    lobby_player_id: seat.id,
    game: "roulette",
    bet_amount_cents: total,
    payout_cents: totalPayout,
    details: { n, color: colorOf(n), results },
  });
  await publishLobby(seat.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: seat.id,
    balanceCents: finalBalance,
  });
  await maybeBustPlayer(seat.lobby_id, seat.id, finalBalance);
  return NextResponse.json({ n, color: colorOf(n), totalPayout, newBalanceCents: finalBalance, results });
}
