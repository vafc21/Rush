import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/db/supabase";
import {
  rollCrashPoint,
  secondsToReachMultiplier,
} from "@/lib/games/crash";
import { publishLobby } from "@/lib/realtime/pusher-server";

/**
 * Runs once a minute on Vercel cron (and on-demand from the CrashGame
 * UI for sub-minute responsiveness during local dev). For each active
 * lobby:
 *   - Finalize any round whose crash time has passed (auto-cashout +
 *     mark the rest lost + broadcast `crash_round_end`).
 *   - If there is no active in-flight round, generate a new one with a
 *     5-second betting window and broadcast `crash_round_start`.
 *
 * Idempotent — re-running while there's nothing to do is a no-op.
 */

const BETTING_WINDOW_MS = 5_000;
const AFTERMATH_MS = 3_000; // pause after a crash before the next round
const MAX_NEW_ROUNDS_PER_TICK = 8;

type CrashBetDetails = {
  roundId: string;
  autoCashoutAt: number | null;
  status: "active" | "cashed_out" | "lost";
  cashedAt?: number;
};

export async function GET() {
  const supabase = getServiceSupabase();
  const now = Date.now();
  let generated = 0;
  let finalized = 0;

  const { data: lobbies } = await supabase
    .from("lobbies")
    .select("id, started_at, duration_seconds")
    .eq("status", "active");
  if (!lobbies || lobbies.length === 0) {
    return NextResponse.json({ generated, finalized });
  }

  for (const lobby of lobbies) {
    // Find the most recent round for this lobby
    const { data: latest } = await supabase
      .from("crash_rounds")
      .select("id, round_number, start_at, crash_multiplier, crashed_at")
      .eq("lobby_id", lobby.id)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Resolve / finalize an unfinalized but expired round ──
    if (latest && !latest.crashed_at) {
      const startMs = new Date(latest.start_at).getTime();
      const crashElapsedSec = secondsToReachMultiplier(
        Number(latest.crash_multiplier)
      );
      const crashedAtMs = startMs + crashElapsedSec * 1000;
      if (now >= crashedAtMs) {
        await finalizeRound(latest.id, lobby.id, Number(latest.crash_multiplier));
        finalized++;
      }
    }

    // Pick the most recent (possibly just finalized) round again
    const { data: lastResolved } = await supabase
      .from("crash_rounds")
      .select("id, round_number, start_at, crash_multiplier, crashed_at")
      .eq("lobby_id", lobby.id)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Generate the next round if we should ──
    // We "should" generate when either:
    //   - there are no rounds yet, OR
    //   - the previous round has finished its aftermath window
    let shouldGenerate = false;
    let nextRoundNumber = 1;
    if (!lastResolved) {
      shouldGenerate = true;
    } else if (lastResolved.crashed_at) {
      const crashedMs = new Date(lastResolved.crashed_at).getTime();
      if (now >= crashedMs + AFTERMATH_MS) {
        shouldGenerate = true;
        nextRoundNumber = lastResolved.round_number + 1;
      }
    }

    if (shouldGenerate) {
      // Don't run away — cap per tick to a small number
      let made = 0;
      while (shouldGenerate && made < MAX_NEW_ROUNDS_PER_TICK) {
        const crashAt = rollCrashPoint();
        const startAt = new Date(now + BETTING_WINDOW_MS).toISOString();
        const { data: round } = await supabase
          .from("crash_rounds")
          .insert({
            lobby_id: lobby.id,
            round_number: nextRoundNumber,
            crash_multiplier: crashAt.toFixed(2),
            start_at: startAt,
          })
          .select("id, start_at, crash_multiplier")
          .single();
        if (round) {
          await publishLobby(lobby.id, {
            type: "crash_round_start",
            roundId: round.id,
            startAtMs: new Date(round.start_at).getTime(),
            crashAt: Number(round.crash_multiplier),
          });
          generated++;
        }
        // Generate just one per tick — the next round will be scheduled
        // by the next tick once this one finishes.
        shouldGenerate = false;
        made++;
      }
    }
  }

  return NextResponse.json({ generated, finalized });
}

async function finalizeRound(
  roundId: string,
  lobbyId: string,
  crashMultiplier: number
): Promise<void> {
  const supabase = getServiceSupabase();

  // Stamp the round as crashed
  await supabase
    .from("crash_rounds")
    .update({ crashed_at: new Date().toISOString() })
    .eq("id", roundId);

  // Resolve all bets in this round that are still active
  const { data: bets } = await supabase
    .from("bets")
    .select("id, lobby_player_id, bet_amount_cents, details")
    .eq("game", "crash")
    .eq("lobby_id", lobbyId);
  if (!bets) return;

  for (const bet of bets) {
    const details = bet.details as CrashBetDetails;
    if (details.roundId !== roundId) continue;
    if (details.status !== "active") continue;

    if (
      details.autoCashoutAt !== null &&
      details.autoCashoutAt <= crashMultiplier
    ) {
      // Auto-cashout fired before crash
      const payoutCents = Math.floor(
        bet.bet_amount_cents * details.autoCashoutAt
      );
      const { data: newBal } = await supabase.rpc("credit_balance", {
        p_player_id: bet.lobby_player_id,
        p_amount_cents: payoutCents,
      });
      const nextDetails: CrashBetDetails = {
        ...details,
        status: "cashed_out",
        cashedAt: details.autoCashoutAt,
      };
      await supabase
        .from("bets")
        .update({ payout_cents: payoutCents, details: nextDetails })
        .eq("id", bet.id);

      await publishLobby(lobbyId, {
        type: "balance_update",
        lobbyPlayerId: bet.lobby_player_id,
        balanceCents: (newBal as number) ?? 0,
      });
      await publishLobby(lobbyId, {
        type: "crash_cashout",
        lobbyPlayerId: bet.lobby_player_id,
        multiplier: details.autoCashoutAt,
        payoutCents,
      });
    } else {
      // Lost the bet (no autoCashout, or autoCashout above crashAt)
      const nextDetails: CrashBetDetails = { ...details, status: "lost" };
      await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    }
  }

  // Tell connected clients the round ended (UI shows aftermath)
  await publishLobby(lobbyId, {
    type: "crash_round_end",
    roundId,
    crashAt: crashMultiplier,
  });
}
