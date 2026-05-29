import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { isLobbyCode } from "@/lib/lobby/codes";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = (body.code ?? "").toUpperCase();
  if (!isLobbyCode(code)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: lobby, error: lobbyErr } = await supabase
    .from("lobbies")
    .select("id, status, size")
    .eq("code", code)
    .single();
  if (lobbyErr || !lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }
  if (lobby.status !== "waiting") {
    return NextResponse.json({ error: "lobby already started" }, { status: 409 });
  }

  const { count } = await supabase
    .from("lobby_players")
    .select("id", { count: "exact", head: true })
    .eq("lobby_id", lobby.id);
  if ((count ?? 0) >= lobby.size) {
    return NextResponse.json({ error: "lobby full" }, { status: 409 });
  }

  const nickname = session.kind === "guest" ? session.nickname : session.username;
  const userId = session.kind === "user" ? session.userId : null;
  const { error: seatErr } = await supabase.from("lobby_players").insert({
    lobby_id: lobby.id,
    user_id: userId,
    nickname,
    is_bot: false,
    balance_cents: 100000,
  });
  if (seatErr) {
    return NextResponse.json({ error: seatErr.message }, { status: 500 });
  }

  return NextResponse.json({ lobbyId: lobby.id });
}
