import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { refundPendingBets } from "@/lib/games/refund";

export async function GET() {
  const supabase = getServiceSupabase();
  const now = new Date();

  // Find ACTIVE lobbies whose end time has passed.
  const { data: lobbies } = await supabase
    .from("lobbies")
    .select("id, started_at, duration_seconds")
    .eq("status", "active");

  for (const l of lobbies ?? []) {
    if (!l.started_at) continue;
    const endsAt = new Date(l.started_at).getTime() + l.duration_seconds * 1000;
    if (endsAt > now.getTime()) continue;

    // Mark ended
    await supabase
      .from("lobbies")
      .update({ status: "ended", ended_at: now.toISOString() })
      .eq("id", l.id);

    // Refund any bet still mid-play (stake deducted, never resolved) so a
    // last-second hand doesn't just swallow the wager. Must run before we
    // read balances for the final ranking.
    await refundPendingBets(supabase, l.id);

    // Compute final ranks
    const { data: players } = await supabase
      .from("lobby_players")
      .select("id, balance_cents")
      .eq("lobby_id", l.id)
      .order("balance_cents", { ascending: false });
    const finalRanks =
      (players ?? []).map((p, i) => ({
        lobbyPlayerId: p.id,
        rank: i + 1,
        balanceCents: p.balance_cents,
      }));

    // Persist final_rank
    for (const fr of finalRanks) {
      await supabase
        .from("lobby_players")
        .update({ final_rank: fr.rank })
        .eq("id", fr.lobbyPlayerId);
    }

    await publishLobby(l.id, { type: "lobby_ended", lobbyId: l.id, finalRanks });
  }

  return NextResponse.json({ swept: lobbies?.length ?? 0 });
}
