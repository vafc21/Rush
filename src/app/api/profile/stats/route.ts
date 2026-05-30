import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

/**
 * GET /api/profile/stats
 *
 * Aggregates stats for the signed-in user from the `bets` table by
 * walking all `lobby_players` rows linked to their user_id, then
 * summing bets / payouts and computing per-lobby finishes.
 *
 * Guests are rejected — they don't have persistent stats.
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }
  if (session.kind !== "user") {
    return NextResponse.json(
      { error: "guests don't have profile stats" },
      { status: 403 }
    );
  }

  const supabase = getServiceSupabase();

  // Pull all the seats this user has occupied across lobbies
  const { data: seats } = await supabase
    .from("lobby_players")
    .select("id, lobby_id, balance_cents, final_rank, joined_at")
    .eq("user_id", session.userId);

  if (!seats || seats.length === 0) {
    return NextResponse.json({
      username: session.username,
      totalGames: 0,
      gamesFinished: 0,
      wins: 0,
      winRate: 0,
      biggestSingleWinCents: 0,
      biggestLobbyFinishCents: 0,
      lifetimeProfitCents: 0,
      biggestBetCents: 0,
    });
  }

  // Pull all this user's bets across all their seats in one query
  const seatIds = seats.map((s) => s.id);
  const { data: bets } = await supabase
    .from("bets")
    .select("bet_amount_cents, payout_cents")
    .in("lobby_player_id", seatIds);

  let lifetimeBet = 0;
  let lifetimePayout = 0;
  let biggestBet = 0;
  let biggestWin = 0;
  for (const b of bets ?? []) {
    lifetimeBet += b.bet_amount_cents;
    lifetimePayout += b.payout_cents;
    if (b.bet_amount_cents > biggestBet) biggestBet = b.bet_amount_cents;
    const profit = b.payout_cents - b.bet_amount_cents;
    if (profit > biggestWin) biggestWin = profit;
  }

  const gamesFinished = seats.filter((s) => s.final_rank !== null).length;
  const wins = seats.filter((s) => s.final_rank === 1).length;
  const biggestLobbyFinish = seats.reduce(
    (max, s) => (s.balance_cents > max ? s.balance_cents : max),
    0
  );

  return NextResponse.json({
    username: session.username,
    totalGames: seats.length,
    gamesFinished,
    wins,
    winRate: gamesFinished > 0 ? wins / gamesFinished : 0,
    biggestSingleWinCents: biggestWin,
    biggestLobbyFinishCents: biggestLobbyFinish,
    lifetimeProfitCents: lifetimePayout - lifetimeBet,
    biggestBetCents: biggestBet,
  });
}
