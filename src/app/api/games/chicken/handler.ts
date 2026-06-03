import { getServiceSupabase } from "@/lib/db/supabase";
import {
  CHICKEN_LANES,
  chickenMultiplier,
  rollCrashLane,
  Difficulty,
} from "@/lib/games/chicken";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { maybeBustPlayer } from "@/lib/games/bust";

type ChickenDetails = {
  difficulty: Difficulty;
  crashLane: number; // 1-indexed lane where a car hits (CHICKEN_LANES+1 = clean run)
  crossed: number; // lanes safely crossed so far
  status: "active" | "cashed_out" | "squashed";
};

export type StartInput = {
  lobbyPlayerId: string;
  betCents: number;
  difficulty: Difficulty;
  _forcedCrashLane?: number;
};

export type StartResult = {
  betId: string;
  difficulty: Difficulty;
  lanes: number;
  multiplierAtFirstLane: number;
  newBalanceCents: number;
};

export async function startChicken(input: StartInput): Promise<StartResult> {
  if (input.betCents < MIN_BET_CENTS) throw new Error("bet below minimum");
  if (input.betCents > MAX_BET_CENTS) throw new Error("bet exceeds maximum");

  const supabase = getServiceSupabase();

  const { data: newBal, error: dedErr } = await supabase.rpc("deduct_balance", {
    p_player_id: input.lobbyPlayerId,
    p_amount_cents: input.betCents,
  });
  if (dedErr) throw new Error(dedErr.message);
  if (newBal === null || newBal === undefined) {
    throw new Error("insufficient balance");
  }

  const crashLane = input._forcedCrashLane ?? rollCrashLane(input.difficulty);

  const { data: player } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("id", input.lobbyPlayerId)
    .single();
  if (!player) throw new Error("player not found");

  const details: ChickenDetails = {
    difficulty: input.difficulty,
    crashLane,
    crossed: 0,
    status: "active",
  };

  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .insert({
      lobby_id: player.lobby_id,
      lobby_player_id: input.lobbyPlayerId,
      game: "chicken",
      bet_amount_cents: input.betCents,
      payout_cents: 0,
      details,
    })
    .select("id")
    .single();
  if (betErr || !bet) throw new Error(betErr?.message ?? "insert failed");

  await publishLobby(player.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: input.lobbyPlayerId,
    balanceCents: newBal as number,
  });

  return {
    betId: bet.id,
    difficulty: input.difficulty,
    lanes: CHICKEN_LANES,
    multiplierAtFirstLane: chickenMultiplier(input.difficulty, 1),
    newBalanceCents: newBal as number,
  };
}

export type StepInput = {
  lobbyPlayerId: string;
  betId: string;
};

export type StepResult = {
  squashed: boolean;
  crossed: number;
  multiplier: number;
  /** Returned only on a squash. */
  crashLane?: number;
};

export async function stepChicken(input: StepInput): Promise<StepResult> {
  const supabase = getServiceSupabase();

  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "chicken") throw new Error("wrong game");

  const details = bet.details as ChickenDetails;
  if (details.status !== "active") throw new Error("game not active");
  if (details.crossed >= CHICKEN_LANES) throw new Error("already across");

  const nextLane = details.crossed + 1; // the lane we're stepping into

  if (nextLane === details.crashLane) {
    const nextDetails: ChickenDetails = { ...details, status: "squashed" };
    await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    // The stake was deducted at start; getting squashed may bust the player.
    await maybeBustPlayer(bet.lobby_id, input.lobbyPlayerId);
    return {
      squashed: true,
      crossed: details.crossed,
      multiplier: 0,
      crashLane: details.crashLane,
    };
  }

  const nextDetails: ChickenDetails = { ...details, crossed: nextLane };
  await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);

  return {
    squashed: false,
    crossed: nextLane,
    multiplier: chickenMultiplier(details.difficulty, nextLane),
  };
}

export type CashoutInput = {
  lobbyPlayerId: string;
  betId: string;
};

export type CashoutResult = {
  payoutCents: number;
  multiplier: number;
  newBalanceCents: number;
  crashLane: number;
};

export async function cashoutChicken(
  input: CashoutInput
): Promise<CashoutResult> {
  const supabase = getServiceSupabase();

  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game, bet_amount_cents")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "chicken") throw new Error("wrong game");

  const details = bet.details as ChickenDetails;
  if (details.status !== "active") throw new Error("game not active");
  if (details.crossed === 0) throw new Error("nothing to cash out");

  const multiplier = chickenMultiplier(details.difficulty, details.crossed);
  const payoutCents = Math.floor(bet.bet_amount_cents * multiplier);

  const { data: newBal, error: creditErr } = await supabase.rpc(
    "credit_balance",
    { p_player_id: input.lobbyPlayerId, p_amount_cents: payoutCents }
  );
  if (creditErr) throw new Error(creditErr.message);

  const nextDetails: ChickenDetails = { ...details, status: "cashed_out" };
  await supabase
    .from("bets")
    .update({ payout_cents: payoutCents, details: nextDetails })
    .eq("id", bet.id);

  await publishLobby(bet.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: input.lobbyPlayerId,
    balanceCents: newBal as number,
  });

  return {
    payoutCents,
    multiplier,
    newBalanceCents: newBal as number,
    crashLane: details.crashLane,
  };
}
