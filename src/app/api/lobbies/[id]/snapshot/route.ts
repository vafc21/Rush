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
    .select("id, code, type, size, duration_seconds, status, started_at, ended_at")
    .eq("id", id)
    .single();
  if (le || !lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }

  const { data: players } = await supabase
    .from("lobby_players")
    .select("id, nickname, user_id, is_bot, is_busted, balance_cents, final_rank")
    .eq("lobby_id", id)
    .order("joined_at");

  // Expose member-ness as a boolean rather than leaking the raw user_id.
  // A "member" is a registered account (user_id set) that isn't a CPU.
  const shaped = (players ?? []).map(({ user_id, ...p }) => ({
    ...p,
    is_member: !p.is_bot && user_id !== null,
  }));

  return NextResponse.json({ lobby, players: shaped });
}
