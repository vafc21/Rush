import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { startTower } from "../handler";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    lobbyId?: string;
    betCents?: number;
    difficulty?: "easy" | "medium" | "hard";
  };
  if (!body.lobbyId || !body.betCents || !body.difficulty) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!["easy", "medium", "hard"].includes(body.difficulty)) {
    return NextResponse.json({ error: "invalid difficulty" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted")
    .eq("lobby_id", body.lobbyId)
    .eq("nickname", identifier)
    .single();
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }
  if (seat.is_busted) {
    return NextResponse.json({ error: "busted" }, { status: 409 });
  }

  try {
    const result = await startTower({
      lobbyPlayerId: seat.id,
      betCents: body.betCents,
      difficulty: body.difficulty,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "internal";
    const status = /insufficient|maximum/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
