import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";

const ALLOWED_EMOJIS = new Set(["🔥", "😱", "💀", "🚀"]);

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
  const body = (await req.json().catch(() => ({}))) as { emoji?: string };
  if (!body.emoji || !ALLOWED_EMOJIS.has(body.emoji)) {
    return NextResponse.json({ error: "invalid emoji" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id")
    .eq("lobby_id", lobbyId)
    .eq("nickname", identifier)
    .single();
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }

  await publishLobby(lobbyId, {
    type: "reaction",
    lobbyPlayerId: seat.id,
    emoji: body.emoji,
  });
  return NextResponse.json({ ok: true });
}
