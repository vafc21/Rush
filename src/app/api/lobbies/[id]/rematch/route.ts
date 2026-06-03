import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";

/**
 * Reset an ENDED custom lobby back to the waiting room so the same group
 * (humans + CPUs) can play another match without re-creating the lobby.
 * Restores every seat to the starting balance, clears busted/final-rank
 * flags, and flips the lobby to "waiting". The host then taps Start Match
 * again. Broadcast lobby_reset so everyone's screen returns to the lobby.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const supabase = getServiceSupabase();

  const { data: lobby, error: le } = await supabase
    .from("lobbies")
    .select("id, status, type, starting_balance_cents")
    .eq("id", lobbyId)
    .single();
  if (le || !lobby) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Rematch only makes sense for custom lobbies; public matchmaking lobbies
  // dissolve at the end and players re-queue from the hub.
  if (lobby.type !== "private") {
    return NextResponse.json(
      { error: "rematch is only for custom lobbies" },
      { status: 409 }
    );
  }
  if (lobby.status !== "ended") {
    return NextResponse.json({ error: "match not finished" }, { status: 409 });
  }

  const startBal = lobby.starting_balance_cents ?? 100000;

  // Reset every seat back to the starting state.
  const { error: pe } = await supabase
    .from("lobby_players")
    .update({ balance_cents: startBal, is_busted: false, final_rank: null })
    .eq("lobby_id", lobbyId);
  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });

  // Flip the lobby back to the waiting room.
  const { error: ue } = await supabase
    .from("lobbies")
    .update({ status: "waiting", started_at: null, ended_at: null })
    .eq("id", lobbyId);
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

  await publishLobby(lobbyId, { type: "lobby_reset", lobbyId });

  return NextResponse.json({ ok: true });
}
