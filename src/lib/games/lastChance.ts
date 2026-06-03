import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-enforced cooldowns between Last Chance rebuy attempts, per game.
 *
 * The client widgets also show a cooldown, but that state lives in React
 * component state — and the Last Chance zone unmounts the active widget when
 * you switch sub-tabs (Wheel ↔ Mines ↔ Flappy). Remounting wipes the client
 * cooldown, so a player could spam spins (each an instant, pre-determined
 * server roll) until the jackpot hit. These server checks are the real rate
 * limiter; the client cooldown is now just UX.
 *
 * Values sit safely below each game's real client cadence so a legitimate
 * player is never rejected, while sub-second spam is always blocked:
 *   - Wheel: the spin button re-enables ~23.5s after a spin (3.5s spin
 *     animation + 20s cooldown).
 *   - Mines: re-enables ~5s after a losing pick.
 */
export const WHEEL_COOLDOWN_MS = 20_000;
export const MINES_COOLDOWN_MS = 4_000;

/**
 * The rebuy a Last Chance win restores you to (500 pts), and the per-attempt
 * win odds of the Mines comeback (1 in 25). Shared so CPU comebacks can run
 * on exactly the same terms as a human's — same odds, same reward, same
 * cooldown — instead of a flat handout.
 */
export const LAST_CHANCE_REBUY_CENTS = 50_000;
export const LAST_CHANCE_MINES_ODDS = 25;

/**
 * Milliseconds remaining before this player may attempt the given Last
 * Chance game again in this lobby (0 if allowed now). Based on the timestamp
 * of their most recent attempt at that game, which is recorded as a bet.
 */
export async function lastChanceCooldownRemaining(
  supabase: SupabaseClient,
  lobbyId: string,
  lobbyPlayerId: string,
  game: "last_chance_wheel" | "last_chance_mines",
  cooldownMs: number
): Promise<number> {
  const { data } = await supabase
    .from("bets")
    .select("placed_at")
    .eq("lobby_id", lobbyId)
    .eq("lobby_player_id", lobbyPlayerId)
    .eq("game", game)
    .order("placed_at", { ascending: false })
    .limit(1);
  const last = data?.[0]?.placed_at as string | undefined;
  if (!last) return 0;
  const elapsed = Date.now() - new Date(last).getTime();
  return Math.max(0, cooldownMs - elapsed);
}
