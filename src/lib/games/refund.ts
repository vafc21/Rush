import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Statuses that mean a bet's stake was deducted up front but the game never
 * resolved. Hold-stake games — mines, dragon_tower, chicken, hilo (all
 * "active") and blackjack ("player_turn") and crash ("active") — take the
 * wager at the start and only pay out on a later cash-out / settle.
 */
const PENDING_STATUSES = ["active", "player_turn"];

/**
 * Refund the stake on every still-in-progress bet when a lobby ends.
 *
 * If a round ends while a hold-stake game is mid-play (e.g. you started a
 * Mines/Chicken hand at the last second and never got to cash out), the
 * player would otherwise just lose the wager having had no chance to resolve
 * it. So we credit the stake back and void the bet — payout = stake, which
 * nets to zero on the end-of-round graph. Single-action games (dice, plinko,
 * roulette, …) settle atomically and never sit in a pending state, so they
 * aren't touched.
 *
 * Returns the number of bets refunded.
 */
export async function refundPendingBets(
  supabase: SupabaseClient,
  lobbyId: string
): Promise<number> {
  const { data: pending } = await supabase
    .from("bets")
    .select("id, lobby_player_id, bet_amount_cents, details")
    .eq("lobby_id", lobbyId)
    .eq("payout_cents", 0)
    .in("details->>status", PENDING_STATUSES);

  let refunded = 0;
  for (const bet of pending ?? []) {
    const stake = bet.bet_amount_cents as number;
    if (!stake || stake <= 0) continue;

    const { error: creditErr } = await supabase.rpc("credit_balance", {
      p_player_id: bet.lobby_player_id,
      p_amount_cents: stake,
    });
    // On a credit failure, leave the bet as-is so a later sweep can retry
    // rather than marking it resolved without returning the money.
    if (creditErr) continue;

    const nextDetails = {
      ...(bet.details as Record<string, unknown>),
      status: "refunded",
    };
    await supabase
      .from("bets")
      .update({ payout_cents: stake, details: nextDetails })
      .eq("id", bet.id);
    refunded++;
  }
  return refunded;
}
