import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

/**
 * POST /api/lobbies/[id]/last-chance/flappy/start
 *
 * Anchors a Flappy run server-side. The bank endpoint validates the
 * reported pipe count against the time elapsed since this marker, so a
 * client can't just POST a huge score for a free jackpot. Records a
 * zero-value `flappy` bet whose placed_at is the run-start timestamp.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const supabase = getServiceSupabase();

  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted")
    .eq("lobby_id", lobbyId)
    .eq("nickname", identifier)
    .single();
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }
  if (!seat.is_busted) {
    return NextResponse.json({ error: "not busted" }, { status: 409 });
  }

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .single();
  if (!lobby || lobby.status !== "active") {
    return NextResponse.json({ error: "round over" }, { status: 409 });
  }

  await supabase.from("bets").insert({
    lobby_id: lobbyId,
    lobby_player_id: seat.id,
    game: "flappy",
    bet_amount_cents: 0,
    payout_cents: 0,
    details: { phase: "start" },
  });

  return NextResponse.json({ ok: true });
}
