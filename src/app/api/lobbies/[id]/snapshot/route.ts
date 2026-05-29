import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id } = await context.params;
  const supabase = getServiceSupabase();

  const { data: lobby, error: le } = await supabase
    .from("lobbies")
    .select("id, code, size, duration_seconds, status, started_at, ended_at")
    .eq("id", id)
    .single();
  if (le || !lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }

  const { data: players } = await supabase
    .from("lobby_players")
    .select("id, nickname, is_bot, is_busted, balance_cents, final_rank")
    .eq("lobby_id", id)
    .order("joined_at");

  return NextResponse.json({ lobby, players: players ?? [] });
}
