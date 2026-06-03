import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True only while a lobby's round is live ("active"). Bet-placement
 * endpoints gate on this so a crafted request can't place bets in the
 * waiting room (padding the balance you carry into the round) or after the
 * round has already ended.
 */
export async function lobbyIsActive(
  supabase: SupabaseClient,
  lobbyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .single();
  return data?.status === "active";
}
