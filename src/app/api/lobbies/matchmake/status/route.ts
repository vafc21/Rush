import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

/**
 * GET /api/lobbies/matchmake/status
 *
 * Returns the requesting session's current queue state. Three shapes:
 *   - { queued: false }                           — not in queue
 *   - { queued: true }                            — in queue, not yet matched
 *   - { queued: true, lobbyId: '...' }            — matched, redirect now
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const sessionId = session.kind === "guest" ? session.guestId : session.userId;
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("matchmaking_queue")
    .select("assigned_lobby_id")
    .eq("session_kind", session.kind)
    .eq("session_id", sessionId)
    .order("queued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ queued: false });
  if (data.assigned_lobby_id)
    return NextResponse.json({ queued: true, lobbyId: data.assigned_lobby_id });
  return NextResponse.json({ queued: true });
}
