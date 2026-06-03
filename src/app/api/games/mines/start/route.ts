import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { lobbyIsActive } from "@/lib/lobby/active";
import { startMinesGame } from "../handler";

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
    minesCount?: number;
  };
  if (!body.lobbyId || !body.betCents || !body.minesCount) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Only place bets while the round is live — not in the waiting room
  // (pre-round balance padding) or after it has ended.
  if (!(await lobbyIsActive(supabase, body.lobbyId))) {
    return NextResponse.json({ error: "round not active" }, { status: 409 });
  }
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
    const result = await startMinesGame({
      lobbyPlayerId: seat.id,
      betCents: body.betCents,
      minesCount: body.minesCount,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "internal";
    const status = /insufficient/i.test(msg) || /maximum/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
