import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

const ALLOWED_SIZES = new Set([4, 8, 16]);
const ALLOWED_DURATIONS = new Set([180, 420, 900]);

/**
 * POST /api/lobbies/matchmake
 * Body: { size, durationSeconds }
 *
 * Enters the public matchmaking queue. The matchmake cron resolves
 * queues into lobbies grouped by (size, duration). Returns immediately;
 * the client polls /matchmake/status to discover the assigned lobby.
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    size?: number;
    durationSeconds?: number;
  };
  if (!ALLOWED_SIZES.has(body.size as number)) {
    return NextResponse.json({ error: "invalid size" }, { status: 400 });
  }
  if (!ALLOWED_DURATIONS.has(body.durationSeconds as number)) {
    return NextResponse.json({ error: "invalid duration" }, { status: 400 });
  }

  const sessionId = session.kind === "guest" ? session.guestId : session.userId;
  const nickname = session.kind === "guest" ? session.nickname : session.username;

  const supabase = getServiceSupabase();

  // Upsert — if the same session is already queued, replace the row
  // (allows changing size/duration without manually leaving the queue).
  await supabase
    .from("matchmaking_queue")
    .delete()
    .eq("session_kind", session.kind)
    .eq("session_id", sessionId)
    .is("assigned_lobby_id", null);

  const { error } = await supabase.from("matchmaking_queue").insert({
    session_kind: session.kind,
    session_id: sessionId,
    nickname,
    size: body.size,
    duration_seconds: body.durationSeconds,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Trigger the matchmaker so local dev gets sub-minute response.
  fetch(new URL("/api/cron/matchmake", req.url).toString()).catch(() => {});

  return NextResponse.json({ queued: true });
}

/**
 * DELETE /api/lobbies/matchmake — leaves the queue.
 */
export async function DELETE() {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }
  const sessionId = session.kind === "guest" ? session.guestId : session.userId;
  const supabase = getServiceSupabase();
  await supabase
    .from("matchmaking_queue")
    .delete()
    .eq("session_kind", session.kind)
    .eq("session_id", sessionId)
    .is("assigned_lobby_id", null);
  return NextResponse.json({ ok: true });
}
