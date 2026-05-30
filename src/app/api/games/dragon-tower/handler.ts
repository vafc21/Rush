import { getServiceSupabase } from "@/lib/db/supabase";
import {
  TOWER_ROWS,
  tilesPerRow,
  placeDragons,
  towerMultiplier,
  Difficulty,
} from "@/lib/games/dragontower";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";

type DragonTowerDetails = {
  difficulty: Difficulty;
  dragons: number[];           // per-row dragon index
  climbed: number[];           // per-row tile the player clicked (length = rowsClimbed)
  status: "active" | "cashed_out" | "burned";
};

export type StartInput = {
  lobbyPlayerId: string;
  betCents: number;
  difficulty: Difficulty;
  _forcedDragons?: number[];
};

export type StartResult = {
  betId: string;
  difficulty: Difficulty;
  tilesPerRow: number;
  rows: number;
  multiplierAtFirstClimb: number;
  newBalanceCents: number;
};

export async function startTower(input: StartInput): Promise<StartResult> {
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

  const dragons = input._forcedDragons ?? placeDragons(input.difficulty);

  const { data: player } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("id", input.lobbyPlayerId)
    .single();
  if (!player) throw new Error("player not found");

  const details: DragonTowerDetails = {
    difficulty: input.difficulty,
    dragons,
    climbed: [],
    status: "active",
  };

  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .insert({
      lobby_id: player.lobby_id,
      lobby_player_id: input.lobbyPlayerId,
      game: "dragon_tower",
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
    tilesPerRow: tilesPerRow(input.difficulty),
    rows: TOWER_ROWS,
    multiplierAtFirstClimb: towerMultiplier(input.difficulty, 1),
    newBalanceCents: newBal as number,
  };
}

export type ClimbInput = {
  lobbyPlayerId: string;
  betId: string;
  tileIndex: number;
};

export type ClimbResult = {
  burned: boolean;
  rowsClimbed: number;
  multiplier: number;
  /** Returned only on burn. */
  dragons?: number[];
};

export async function climbTower(input: ClimbInput): Promise<ClimbResult> {
  const supabase = getServiceSupabase();

  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "dragon_tower") throw new Error("wrong game");

  const details = bet.details as DragonTowerDetails;
  if (details.status !== "active") throw new Error("game not active");

  const currentRow = details.climbed.length;
  if (currentRow >= TOWER_ROWS) {
    throw new Error("tower already topped");
  }
  const tpr = tilesPerRow(details.difficulty);
  if (input.tileIndex < 0 || input.tileIndex >= tpr) {
    throw new Error("tile out of range");
  }

  const dragonIndex = details.dragons[currentRow];
  if (input.tileIndex === dragonIndex) {
    const nextDetails: DragonTowerDetails = { ...details, status: "burned" };
    await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    return {
      burned: true,
      rowsClimbed: currentRow,
      multiplier: 0,
      dragons: details.dragons,
    };
  }

  const nextClimbed = [...details.climbed, input.tileIndex];
  const nextDetails: DragonTowerDetails = { ...details, climbed: nextClimbed };
  await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);

  return {
    burned: false,
    rowsClimbed: nextClimbed.length,
    multiplier: towerMultiplier(details.difficulty, nextClimbed.length),
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
  dragons: number[];
};

export async function cashoutTower(input: CashoutInput): Promise<CashoutResult> {
  const supabase = getServiceSupabase();

  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game, bet_amount_cents")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "dragon_tower") throw new Error("wrong game");

  const details = bet.details as DragonTowerDetails;
  if (details.status !== "active") throw new Error("game not active");
  if (details.climbed.length === 0) throw new Error("nothing to cash out");

  const multiplier = towerMultiplier(details.difficulty, details.climbed.length);
  const payoutCents = Math.floor(bet.bet_amount_cents * multiplier);

  const { data: newBal, error: creditErr } = await supabase.rpc(
    "credit_balance",
    { p_player_id: input.lobbyPlayerId, p_amount_cents: payoutCents }
  );
  if (creditErr) throw new Error(creditErr.message);

  const nextDetails: DragonTowerDetails = { ...details, status: "cashed_out" };
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
    dragons: details.dragons,
  };
}
