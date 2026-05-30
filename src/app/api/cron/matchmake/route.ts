import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/db/supabase";
import { generateNickname } from "@/lib/lobby/nicknames";
import { publishLobby } from "@/lib/realtime/pusher-server";

/**
 * Resolves matchmaking_queue entries into public lobbies.
 *
 * Algorithm per (size, duration) bucket:
 *   - Group all unassigned queue entries.
 *   - If 2+ humans exist OR any human has been waiting >= SOLO_WAIT_MS,
 *     create a fresh public lobby and seat them.
 *   - Bots silently fill empty seats.
 *   - Lobby starts immediately (transitions to "active", broadcasts
 *     lobby_starting / lobby_active so connected clients land in the
 *     game without an explicit Start button).
 */

const SOLO_WAIT_MS = 15_000;
const COUNTDOWN_MS = 5_000;
const STARTING_BALANCE_CENTS = 100_000;

export async function GET() {
  const supabase = getServiceSupabase();
  const now = Date.now();
  let lobbiesCreated = 0;

  // Pull all unassigned entries
  const { data: queue } = await supabase
    .from("matchmaking_queue")
    .select("id, session_kind, session_id, nickname, size, duration_seconds, queued_at")
    .is("assigned_lobby_id", null)
    .order("queued_at", { ascending: true });
  if (!queue || queue.length === 0) {
    return NextResponse.json({ lobbiesCreated });
  }

  // Bucket by (size, duration)
  const buckets = new Map<string, typeof queue>();
  for (const entry of queue) {
    const key = `${entry.size}-${entry.duration_seconds}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(entry);
  }

  for (const [, entries] of buckets) {
    while (entries.length > 0) {
      // Find how many humans are eligible to be matched right now
      const oldest = entries[0];
      const oldestWaitedMs = now - new Date(oldest.queued_at).getTime();
      const enoughHumans = entries.length >= 2;
      const soloTimedOut = oldestWaitedMs >= SOLO_WAIT_MS;
      if (!enoughHumans && !soloTimedOut) break;

      // Take up to `size` humans
      const size = oldest.size;
      const duration = oldest.duration_seconds;
      const humans = entries.splice(0, Math.min(entries.length, size));

      // Create the lobby
      const startsAt = now + COUNTDOWN_MS;
      const endsAt = startsAt + duration * 1000;
      const { data: lobby, error: lobbyErr } = await supabase
        .from("lobbies")
        .insert({
          code: null,
          type: "public",
          host_user_id: null,
          size,
          duration_seconds: duration,
          status: "active",
          starting_balance_cents: STARTING_BALANCE_CENTS,
          started_at: new Date(startsAt).toISOString(),
        })
        .select("id")
        .single();
      if (lobbyErr || !lobby) continue;

      // Seat the humans
      const humanRows = humans.map((h) => ({
        lobby_id: lobby.id,
        user_id: h.session_kind === "user" ? h.session_id : null,
        nickname: h.nickname,
        is_bot: false,
        balance_cents: STARTING_BALANCE_CENTS,
      }));
      await supabase.from("lobby_players").insert(humanRows);

      // Fill remaining seats with bots
      const botCount = size - humans.length;
      if (botCount > 0) {
        const botRows = Array.from({ length: botCount }, () => ({
          lobby_id: lobby.id,
          user_id: null,
          nickname: generateNickname(),
          is_bot: true,
          balance_cents: STARTING_BALANCE_CENTS,
        }));
        await supabase.from("lobby_players").insert(botRows);
      }

      // Mark queue entries as assigned
      await supabase
        .from("matchmaking_queue")
        .update({ assigned_lobby_id: lobby.id })
        .in(
          "id",
          humans.map((h) => h.id)
        );

      // Tell clients (the status endpoint is what the UI polls, so the
      // pusher events here are mostly for already-connected clients —
      // not needed for the redirect path).
      await publishLobby(lobby.id, {
        type: "lobby_starting",
        lobbyId: lobby.id,
        startsAt,
      });
      await publishLobby(lobby.id, {
        type: "lobby_active",
        lobbyId: lobby.id,
        endsAt,
      });

      lobbiesCreated++;
    }
  }

  return NextResponse.json({ lobbiesCreated });
}
