import { getServiceSupabase } from "@/lib/db/supabase";

export type UserStats = {
  username: string;
  totalGames: number;
  gamesFinished: number;
  wins: number;
  winRate: number;
  biggestSingleWinCents: number;
  biggestLobbyFinishCents: number;
  lifetimeProfitCents: number;
  biggestBetCents: number;
};

/**
 * Aggregate lifetime stats for a registered user from their `lobby_players`
 * seats and the `bets` placed in those seats.
 *
 * Shared by the signed-in `/api/profile/stats` endpoint (own stats) and the
 * public `/api/users/[username]/stats` endpoint (the leaderboard "Member"
 * links). Guests are never passed here — they have no row in `users`.
 */
export async function computeUserStats(
  userId: string,
  username: string
): Promise<UserStats> {
  const supabase = getServiceSupabase();

  // Every seat this user has occupied across lobbies.
  const { data: seats } = await supabase
    .from("lobby_players")
    .select("id, lobby_id, balance_cents, final_rank, joined_at")
    .eq("user_id", userId);

  if (!seats || seats.length === 0) {
    return {
      username,
      totalGames: 0,
      gamesFinished: 0,
      wins: 0,
      winRate: 0,
      biggestSingleWinCents: 0,
      biggestLobbyFinishCents: 0,
      lifetimeProfitCents: 0,
      biggestBetCents: 0,
    };
  }

  // All bets across all their seats in one query.
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

  return {
    username,
    totalGames: seats.length,
    gamesFinished,
    wins,
    winRate: gamesFinished > 0 ? wins / gamesFinished : 0,
    biggestSingleWinCents: biggestWin,
    biggestLobbyFinishCents: biggestLobbyFinish,
    lifetimeProfitCents: lifetimePayout - lifetimeBet,
    biggestBetCents: biggestBet,
  };
}
