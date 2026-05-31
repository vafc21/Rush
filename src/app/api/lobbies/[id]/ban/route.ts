import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import {
  banKeyForPlayer,
  getCallerPlayerId,
  getHostPlayerId,
} from "@/lib/lobby/host";

/**
 * POST /api/lobbies/[id]/ban
 * Body: { lobbyPlayerId }
 *
 * Host-only. Removes the player AND adds them to lobby_bans so they
 * can't rejoin with the same lobby code. Bots can also be "banned"
 * (it's basically a remove since they have no identity to rejoin
 * with — we just delete them).
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
    return NextResponse.json({ error: "cannot ban host" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("lobby_players")
    .select("id, user_id, nickname, is_bot")
    .eq("id", body.lobbyPlayerId)
    .eq("lobby_id", lobbyId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "player not in lobby" }, { status: 404 });
  }

  // Record the ban (skip for bots — meaningless and they get new ids).
  if (!target.is_bot) {
    const key = banKeyForPlayer(target);
    await supabase
      .from("lobby_bans")
      .upsert(
        { lobby_id: lobbyId, ...key },
        { onConflict: "lobby_id,session_kind,session_id" }
      );
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
