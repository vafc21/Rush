import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { generateNickname } from "@/lib/lobby/nicknames";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { getCallerPlayerId, getHostPlayerId } from "@/lib/lobby/host";

const HARD_CAP = 32; // matches the relaxed lobbies.size_check

/**
 * POST /api/lobbies/[id]/add-cpu
 *
 * Host-only. Adds a single bot to the lobby. Only valid while the
 * lobby is in "waiting" state.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const supabase = getServiceSupabase();

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("id, status, type")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (lobby.status !== "waiting") {
    return NextResponse.json({ error: "round already started" }, { status: 409 });
  }
  if (lobby.type !== "private") {
    // Matchmaking lobbies auto-fill bots; manual add doesn't apply.
    return NextResponse.json({ error: "not a custom lobby" }, { status: 400 });
  }

  const [hostId, callerId] = await Promise.all([
    getHostPlayerId(supabase, lobbyId),
    getCallerPlayerId(supabase, lobbyId, session),
  ]);
  if (!callerId || hostId !== callerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }

  const { count } = await supabase
    .from("lobby_players")
    .select("id", { count: "exact", head: true })
    .eq("lobby_id", lobbyId);
  if ((count ?? 0) >= HARD_CAP) {
    return NextResponse.json({ error: "lobby full" }, { status: 409 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("lobby_players")
    .insert({
      lobby_id: lobbyId,
      user_id: null,
      nickname: generateNickname(),
      is_bot: true,
      balance_cents: 100000,
    })
    .select("id, nickname, is_bot")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "could not add bot" },
      { status: 500 }
    );
  }

  await publishLobby(lobbyId, {
    type: "player_joined",
    lobbyPlayerId: inserted.id,
    nickname: inserted.nickname,
    isBot: inserted.is_bot,
    isMember: false,
  });

  return NextResponse.json({
    lobbyPlayerId: inserted.id,
    nickname: inserted.nickname,
  });
}
