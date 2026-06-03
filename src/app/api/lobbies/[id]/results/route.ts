import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

/**
 * Returns the data needed to render the end-of-round line chart and
 * leaderboard: lobby metadata, every player (with final rank + balance),
 * and every bet placed during the round (sorted by placed_at). The client
 * reconstructs each player's balance trajectory by walking bets in order.
 */
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
    .select(
      "id, code, started_at, ended_at, duration_seconds, starting_balance_cents"
    )
    .eq("id", id)
    .single();
  if (le || !lobby) {
    return NextResponse.json({ error: "lobby not found" }, { status: 404 });
  }

  const { data: players } = await supabase
    .from("lobby_players")
    .select("id, nickname, is_bot, balance_cents, final_rank")
    .eq("lobby_id", id);

  // Scope to the current match. A custom lobby can be replayed ("Play
  // Again"), which reuses the same lobby row — without this filter the graph
  // would fold in every prior match's bets. started_at marks the active
  // round's start; all in-round bets land at or after it.
  let betsQuery = supabase
    .from("bets")
    .select("lobby_player_id, placed_at, bet_amount_cents, payout_cents")
    .eq("lobby_id", id)
    .order("placed_at", { ascending: true });
  if (lobby.started_at) {
    betsQuery = betsQuery.gte("placed_at", lobby.started_at);
  }
  const { data: bets } = await betsQuery;

  return NextResponse.json({
    lobby,
    players: players ?? [],
    bets: bets ?? [],
  });
}
