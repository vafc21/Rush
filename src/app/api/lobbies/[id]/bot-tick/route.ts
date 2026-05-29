import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/db/supabase";
import { placeDiceBet } from "@/app/api/games/dice/play/handler";

/**
 * Called periodically by any active lobby client (every ~4s, see lobby page).
 * Picks one random non-busted bot and gives them a chance to place a small
 * dice bet. Returns what happened so callers can see whether a bet was made.
 *
 * No auth required — abuse risk is minimal (worst case: bots act more often
 * and bust faster).
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await context.params;
  const supabase = getServiceSupabase();

  const { data: lobby, error: le } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .single();
  if (le || !lobby) {
    return NextResponse.json({ skipped: "lobby not found" }, { status: 404 });
  }
  if (lobby.status !== "active") {
    return NextResponse.json({ skipped: "lobby not active" });
  }

  const { data: bots } = await supabase
    .from("lobby_players")
    .select("id, balance_cents")
    .eq("lobby_id", lobbyId)
    .eq("is_bot", true)
    .eq("is_busted", false);

  if (!bots || bots.length === 0) {
    return NextResponse.json({ skipped: "no eligible bots" });
  }

  // Coin-flip each tick whether to act at all — keeps the leaderboard moving
  // without being chaotic.
  if (Math.random() < 0.4) {
    return NextResponse.json({ skipped: "idle" });
  }

  const bot = bots[Math.floor(Math.random() * bots.length)];

  // Bet 1–10% of current balance, min $1.00.
  const balanceCents = bot.balance_cents;
  if (balanceCents < 100) {
    return NextResponse.json({ skipped: "bot too poor" });
  }
  const fraction = 0.01 + Math.random() * 0.09;
  const betCents = Math.max(100, Math.min(balanceCents, Math.floor(balanceCents * fraction / 100) * 100));

  // Skew bot risk-taking toward "safe-ish" (roll under 50–80).
  const rollUnder = 50 + Math.floor(Math.random() * 31);

  try {
    const result = await placeDiceBet({
      lobbyPlayerId: bot.id,
      betCents,
      rollUnder,
    });
    return NextResponse.json({
      acted: true,
      botId: bot.id,
      betCents,
      rollUnder,
      ...result,
    });
  } catch (e: unknown) {
    return NextResponse.json({
      skipped: e instanceof Error ? e.message : "error",
    });
  }
}
