import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/db/supabase";
import { placeDiceBet } from "@/app/api/games/dice/play/handler";
import {
  startMinesGame,
  revealMinesTile,
  cashoutMinesGame,
} from "@/app/api/games/mines/handler";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { MAX_BET_CENTS } from "@/lib/games/limits";

const BOT_REACTIONS = ["🔥", "😱", "💀", "🚀"] as const;

type Archetype = "cautious" | "balanced" | "chaotic";

type Personality = {
  actChance: number;
  reactChance: number;
  betFractionRange: [number, number];
  /** Probability that, if betting, the bot picks Mines. */
  minesShare: number;
  /** Probability that, if betting, the bot picks Crash (and there's a window). */
  crashShare: number;
  /** Otherwise: Dice. */
  crashAutoCashoutRange: [number, number];
  /** Higher rollUnder = safer dice. */
  diceRollUnderRange: [number, number];
  /** Mines count picked when the bot plays Mines. */
  minesCountRange: [number, number];
};

const PROFILES: Record<Archetype, Personality> = {
  cautious: {
    actChance: 0.25,
    reactChance: 0.06,
    betFractionRange: [0.01, 0.03],
    minesShare: 0,
    crashShare: 0.15,
    crashAutoCashoutRange: [1.3, 2.0],
    diceRollUnderRange: [70, 90],
    minesCountRange: [1, 2],
  },
  balanced: {
    actChance: 0.5,
    reactChance: 0.12,
    betFractionRange: [0.03, 0.07],
    minesShare: 0.18,
    crashShare: 0.3,
    crashAutoCashoutRange: [1.5, 3.5],
    diceRollUnderRange: [50, 75],
    minesCountRange: [2, 5],
  },
  chaotic: {
    actChance: 0.75,
    reactChance: 0.25,
    betFractionRange: [0.07, 0.15],
    minesShare: 0.3,
    crashShare: 0.4,
    crashAutoCashoutRange: [2.5, 8.0],
    diceRollUnderRange: [10, 50],
    minesCountRange: [5, 12],
  },
};

/** Derives a stable archetype from a bot's UUID — same bot, same personality. */
function archetypeFor(botId: string): Archetype {
  let h = 0;
  for (let i = 0; i < botId.length; i++) {
    h = (h * 31 + botId.charCodeAt(i)) >>> 0;
  }
  // 20% cautious / 60% balanced / 20% chaotic
  const slots: Archetype[] = [
    "cautious",
    "balanced",
    "balanced",
    "balanced",
    "chaotic",
  ];
  return slots[h % slots.length];
}

function randomInRange([lo, hi]: [number, number]): number {
  return lo + Math.random() * (hi - lo);
}

function pickInt([lo, hi]: [number, number]): number {
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

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

  const bot = bots[Math.floor(Math.random() * bots.length)];
  const profile = PROFILES[archetypeFor(bot.id)];

  // Reaction roll — independent of betting; some ticks just emote.
  if (Math.random() < profile.reactChance) {
    const emoji = BOT_REACTIONS[Math.floor(Math.random() * BOT_REACTIONS.length)];
    await publishLobby(lobbyId, {
      type: "reaction",
      lobbyPlayerId: bot.id,
      emoji,
    });
  }

  // Act roll — should this bot place a bet this tick?
  if (Math.random() > profile.actChance) {
    return NextResponse.json({ skipped: "bot idle" });
  }

  if (bot.balance_cents < 100) {
    return NextResponse.json({ skipped: "bot too poor" });
  }

  // Bet sizing
  const fraction = randomInRange(profile.betFractionRange);
  const idealCents = Math.floor((bot.balance_cents * fraction) / 100) * 100;
  const betCents = Math.max(
    100,
    Math.min(bot.balance_cents, MAX_BET_CENTS, idealCents)
  );

  // Decide game
  const gameRoll = Math.random();
  let chosenGame: "dice" | "mines" | "crash" = "dice";

  // Crash only if there's an open betting window for this lobby
  if (gameRoll < profile.crashShare) {
    const { data: round } = await supabase
      .from("crash_rounds")
      .select("id, start_at")
      .eq("lobby_id", lobbyId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (round && new Date(round.start_at).getTime() > Date.now()) {
      chosenGame = "crash";
      // Place a Crash bet with autoCashout
      const auto = Number(randomInRange(profile.crashAutoCashoutRange).toFixed(2));
      const { data: newBal, error: dedErr } = await supabase.rpc(
        "deduct_balance",
        { p_player_id: bot.id, p_amount_cents: betCents }
      );
      if (!dedErr && newBal !== null) {
        await supabase.from("bets").insert({
          lobby_id: lobbyId,
          lobby_player_id: bot.id,
          game: "crash",
          bet_amount_cents: betCents,
          payout_cents: 0,
          details: {
            roundId: round.id,
            autoCashoutAt: auto,
            status: "active",
          },
        });
        await publishLobby(lobbyId, {
          type: "balance_update",
          lobbyPlayerId: bot.id,
          balanceCents: newBal as number,
        });
        return NextResponse.json({
          acted: true,
          archetype: archetypeFor(bot.id),
          game: "crash",
          betCents,
          autoCashoutAt: auto,
        });
      }
      // Fall through to Dice on deduct failure
    }
  }

  if (gameRoll >= profile.crashShare && gameRoll < profile.crashShare + profile.minesShare) {
    chosenGame = "mines";
    // Mines: open, reveal 1-3 safe tiles, cash out.
    const minesCount = pickInt(profile.minesCountRange);
    try {
      const started = await startMinesGame({
        lobbyPlayerId: bot.id,
        betCents,
        minesCount,
      });
      // Reveal up to 3 random tiles, stopping if we explode
      const targetClicks = pickInt([1, 3]);
      const tried = new Set<number>();
      let exploded = false;
      for (let i = 0; i < targetClicks; i++) {
        let tile = Math.floor(Math.random() * 25);
        let guard = 0;
        while (tried.has(tile) && guard < 20) {
          tile = Math.floor(Math.random() * 25);
          guard++;
        }
        tried.add(tile);
        const reveal = await revealMinesTile({
          lobbyPlayerId: bot.id,
          betId: started.betId,
          tileIndex: tile,
        });
        if (reveal.exploded) {
          exploded = true;
          break;
        }
      }
      if (!exploded) {
        await cashoutMinesGame({
          lobbyPlayerId: bot.id,
          betId: started.betId,
        });
      }
      return NextResponse.json({
        acted: true,
        archetype: archetypeFor(bot.id),
        game: "mines",
        minesCount,
        betCents,
        exploded,
      });
    } catch {
      // Fall through to Dice on any error
      chosenGame = "dice";
    }
  }

  // Default + fall-through: Dice
  const rollUnder = pickInt([
    Math.floor(profile.diceRollUnderRange[0]),
    Math.floor(profile.diceRollUnderRange[1]),
  ]);
  try {
    const result = await placeDiceBet({
      lobbyPlayerId: bot.id,
      betCents,
      rollUnder,
    });
    return NextResponse.json({
      acted: true,
      archetype: archetypeFor(bot.id),
      game: chosenGame,
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
