import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { generateLobbyCode } from "@/lib/lobby/codes";

const ALLOWED_SIZES = new Set([4, 8, 16]);
const ALLOWED_DURATIONS = new Set([180, 420, 900]);

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

  const supabase = getServiceSupabase();

  // Retry up to 3x in case of unique-code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateLobbyCode();
    const hostUserId = session.kind === "user" ? session.userId : null;
    const { data: lobby, error } = await supabase
      .from("lobbies")
      .insert({
        code,
        type: "private",
        host_user_id: hostUserId,
        size: body.size,
        duration_seconds: body.durationSeconds,
        status: "waiting",
      })
      .select("id, code")
      .single();
    if (error) {
      if (error.code === "23505") continue; // unique violation, retry
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Seat the creator
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

    return NextResponse.json({ lobbyId: lobby.id, code: lobby.code });
  }

  return NextResponse.json({ error: "code collision" }, { status: 500 });
}
