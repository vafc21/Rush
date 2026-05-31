import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { getCallerPlayerId, getHostPlayerId } from "@/lib/lobby/host";

/**
 * POST /api/lobbies/[id]/kick
 * Body: { lobbyPlayerId }
 *
 * Host-only. Removes the named player from the lobby. The host cannot
 * kick themselves. No ban is recorded — the player may rejoin via
 * code. Use /ban to also prevent re-entry.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    lobbyPlayerId?: string;
  };
  if (!body.lobbyPlayerId) {
    return NextResponse.json({ error: "missing lobbyPlayerId" }, { status: 400 });
  }
  const supabase = getServiceSupabase();

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("id, status, type")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (lobby.type !== "private") {
    return NextResponse.json({ error: "not a custom lobby" }, { status: 400 });
  }

  const [hostId, callerId] = await Promise.all([
    getHostPlayerId(supabase, lobbyId),
    getCallerPlayerId(supabase, lobbyId, session),
  ]);
  if (!callerId || hostId !== callerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  if (body.lobbyPlayerId === callerId) {
    return NextResponse.json({ error: "cannot kick host" }, { status: 400 });
  }

  // Confirm the target is in this lobby
  const { data: target } = await supabase
    .from("lobby_players")
    .select("id")
    .eq("id", body.lobbyPlayerId)
    .eq("lobby_id", lobbyId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "player not in lobby" }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from("lobby_players")
    .delete()
    .eq("id", body.lobbyPlayerId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await publishLobby(lobbyId, {
    type: "player_left",
    lobbyPlayerId: body.lobbyPlayerId,
  });

  return NextResponse.json({ ok: true });
}
