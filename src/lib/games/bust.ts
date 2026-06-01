import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { MIN_BET_CENTS } from "./limits";

/**
 * Authoritative "player ran out of money" transition.
 *
 * A player is busted once their balance can no longer cover the minimum
 * bet. This helper is the single place that flips the DB `is_busted` flag
 * and fires the `player_busted` realtime event, which is the ONLY signal
 * clients trust to drop a player into the Last Chance zone.
 *
 * Crucially, this must be called when a bet has *settled* — never on the
 * bare deduction of a still-pending wager. A Crash bet (or any in-flight
 * multi-step game) deducts up front but can still pay out, so a momentary
 * sub-$1 balance there does not mean the player is busted. Clients
 * therefore must not infer "busted" from a low `balance_update` alone;
 * they wait for `player_busted` instead.
 *
 * Pass the post-settlement balance when you already have it; omit it and
 * the helper reads the current balance (used by the "lost" paths of
 * multi-step games, where the deduction happened in an earlier request).
 *
 * Idempotent: re-marking an already-busted player is harmless.
 */
export async function maybeBustPlayer(
  lobbyId: string,
  lobbyPlayerId: string,
  balanceCents?: number
): Promise<boolean> {
  const supabase = getServiceSupabase();

  let balance = balanceCents;
  if (balance === undefined || balance === null) {
    const { data } = await supabase
      .from("lobby_players")
      .select("balance_cents")
      .eq("id", lobbyPlayerId)
      .single();
    balance = data?.balance_cents;
  }
  if (balance === undefined || balance === null || balance >= MIN_BET_CENTS) {
    return false;
  }

  await supabase
    .from("lobby_players")
    .update({ is_busted: true })
    .eq("id", lobbyPlayerId);
  await publishLobby(lobbyId, { type: "player_busted", lobbyPlayerId });
  return true;
}
