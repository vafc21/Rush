import type { SessionPayload } from "@/lib/auth/jwt";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Key used to enforce per-lobby bans, matching the lobby_bans table
 * columns (session_kind, session_id). Logged-in accounts ban by user
 * UUID; guests ban by (lowercased) nickname — the only stable handle
 * we have for a guest from their lobby_players row. Guests can trivially
 * circumvent this by changing nickname; that's accepted for this game.
 */
export type BanKey = { session_kind: string; session_id: string };

/** Ban key for the CURRENT caller's session (used at join time). */
export function banKeyForSession(session: SessionPayload): BanKey {
  if (session.kind === "user") {
    return { session_kind: "user", session_id: session.userId };
  }
  return { session_kind: "guest", session_id: session.nickname.toLowerCase() };
}

/** Ban key for a TARGET lobby_players row (used at ban time). */
export function banKeyForPlayer(player: {
  user_id: string | null;
  nickname: string;
}): BanKey {
  if (player.user_id) {
    return { session_kind: "user", session_id: player.user_id };
  }
  return { session_kind: "guest", session_id: player.nickname.toLowerCase() };
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
