import type { SessionPayload } from "@/lib/auth/jwt";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Identifier we use to enforce per-lobby bans. Logged-in accounts ban
 * by user UUID; guests can only be banned by (lowercased) nickname.
 * Guests can trivially circumvent the latter by changing nickname —
 * that's accepted for this game.
 */
export function banIdentifierForSession(session: SessionPayload): string {
  if (session.kind === "user") return `user:${session.userId}`;
  return `nick:${session.nickname.toLowerCase()}`;
}

/**
 * Returns the lobby_player.id of the first-seated player (the lobby
 * "host"). For host-only endpoints we then check the caller's seat
 * id matches this.
 */
export async function getHostPlayerId(
  supabase: SupabaseClient,
  lobbyId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("lobby_players")
    .select("id")
    .eq("lobby_id", lobbyId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Returns the caller's lobby_player.id in this lobby, or null if they
 * aren't seated. Used to gate host-only endpoints.
 */
export async function getCallerPlayerId(
  supabase: SupabaseClient,
  lobbyId: string,
  session: SessionPayload
): Promise<string | null> {
  const nickname =
    session.kind === "user" ? session.username : session.nickname;
  const userId = session.kind === "user" ? session.userId : null;
  // Prefer match by user_id when logged in (nicknames can collide for
  // guests), otherwise match by nickname.
  let query = supabase
    .from("lobby_players")
    .select("id")
    .eq("lobby_id", lobbyId)
    .eq("is_bot", false);
  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("nickname", nickname).is("user_id", null);
  }
  const { data } = await query.maybeSingle();
  return data?.id ?? null;
}
