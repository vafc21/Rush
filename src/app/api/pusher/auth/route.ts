import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { authorizeChannel } from "@/lib/realtime/pusher-server";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const form = await req.formData();
  const socketId = form.get("socket_id") as string | null;
  const channel = form.get("channel_name") as string | null;
  if (!socketId || !channel) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  if (!channel.startsWith("private-lobby-")) {
    return NextResponse.json({ error: "channel not allowed" }, { status: 403 });
  }
  const lobbyId = channel.replace("private-lobby-", "");

  // Verify session has a seat in this lobby
  const supabase = getServiceSupabase();
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data, error } = await supabase
    .from("lobby_players")
    .select("id")
    .eq("lobby_id", lobbyId)
    .eq("nickname", identifier)
    .limit(1);
  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }

  return NextResponse.json(authorizeChannel(socketId, channel));
}
