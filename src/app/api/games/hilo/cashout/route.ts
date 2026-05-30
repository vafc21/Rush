import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { cashoutHilo } from "../handler";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }
  const body = (await req.json().catch(() => ({}))) as { betId?: string };
  if (!body.betId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: bet } = await supabase
    .from("bets")
    .select("lobby_id")
    .eq("id", body.betId)
    .single();
  if (!bet) return NextResponse.json({ error: "bet not found" }, { status: 404 });
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id")
    .eq("lobby_id", bet.lobby_id)
    .eq("nickname", identifier)
    .single();
  if (!seat) return NextResponse.json({ error: "not your bet" }, { status: 403 });

  try {
    const result = await cashoutHilo({
      lobbyPlayerId: seat.id,
      betId: body.betId,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "internal";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
