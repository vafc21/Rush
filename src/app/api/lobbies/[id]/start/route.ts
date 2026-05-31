import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { generateNickname } from "@/lib/lobby/nicknames";
import { publishLobby } from "@/lib/realtime/pusher-server";

const COUNTDOWN_MS = 5000;

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const supabase = getServiceSupabase();

  const { data: lobby, error: le } = await supabase
    .from("lobbies")
    .select("id, status, size, type, duration_seconds")
    .eq("id", lobbyId)
    .single();
  if (le || !lobby) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (lobby.status !== "waiting") {
    return NextResponse.json({ error: "already started" }, { status: 409 });
  }

  // Auto-fill bots only for matchmaking lobbies. Custom (private)
  // lobbies start with exactly whoever the host added — friends + any
  // CPUs they explicitly added with the + Add CPU button.
  if (lobby.type === "public") {
    const { data: existing } = await supabase
      .from("lobby_players")
      .select("id")
      .eq("lobby_id", lobbyId);
    const seated = existing?.length ?? 0;
    const botsNeeded = Math.max(0, lobby.size - seated);

    const botRows = Array.from({ length: botsNeeded }, () => ({
      lobby_id: lobbyId,
      user_id: null,
      nickname: generateNickname(),
      is_bot: true,
      balance_cents: 100000,
    }));
    if (botRows.length > 0) {
      const { data: insertedBots, error: be } = await supabase
        .from("lobby_players")
        .insert(botRows)
        .select("id, nickname, is_bot");
      if (be) return NextResponse.json({ error: be.message }, { status: 500 });
      for (const bot of insertedBots ?? []) {
        await publishLobby(lobbyId, {
          type: "player_joined",
          lobbyPlayerId: bot.id,
          nickname: bot.nickname,
          isBot: bot.is_bot,
        });
      }
    }
  }

  // Transition to starting
  const now = Date.now();
  const startsAt = now + COUNTDOWN_MS;
  const endsAt = startsAt + lobby.duration_seconds * 1000;

  const { error: ue } = await supabase
    .from("lobbies")
    .update({
      status: "active",                       // we'll move through 'starting' visually only
      started_at: new Date(startsAt).toISOString(),
    })
    .eq("id", lobbyId);
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

  // Tell everyone we're counting down then going active.
  await publishLobby(lobbyId, { type: "lobby_starting", lobbyId, startsAt });
  await publishLobby(lobbyId, { type: "lobby_active", lobbyId, endsAt });

  return NextResponse.json({ startsAt, endsAt });
}
