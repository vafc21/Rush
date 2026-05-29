import { getServiceSupabase } from "@/lib/db/supabase";
import {
  MIN_MINES,
  MAX_MINES,
  MINES_TILES,
  placeMines,
  minesMultiplier,
} from "@/lib/games/mines";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";

/**
 * Mines game-state is stored on a single `bets` row's `details` JSON for
 * the lifetime of the game (start → reveals → cashout|explode).
 */
type MinesDetails = {
  mines: number;
  mine_positions: number[];
  revealed: number[];
  status: "active" | "cashed_out" | "exploded";
};

export type MinesStartInput = {
  lobbyPlayerId: string;
  betCents: number;
  minesCount: number;
  _forcedMines?: number[]; // for tests
};

export type MinesStartResult = {
  betId: string;
  minesCount: number;
  multiplierAtFirstClick: number;
  newBalanceCents: number;
};

export async function startMinesGame(
  input: MinesStartInput
): Promise<MinesStartResult> {
  if (input.betCents < MIN_BET_CENTS) throw new Error("bet below minimum");
  if (input.betCents > MAX_BET_CENTS) throw new Error("bet exceeds maximum");
  if (input.minesCount < MIN_MINES || input.minesCount > MAX_MINES) {
    throw new Error("invalid mines count");
  }

  const supabase = getServiceSupabase();

  const { data: newBal, error: deductErr } = await supabase.rpc(
    "deduct_balance",
    { p_player_id: input.lobbyPlayerId, p_amount_cents: input.betCents }
  );
  if (deductErr) throw new Error(deductErr.message);
  if (newBal === null || newBal === undefined) {
    throw new Error("insufficient balance");
  }

  const mine_positions = input._forcedMines
    ? [...input._forcedMines].sort((a, b) => a - b)
    : placeMines(input.minesCount);

  const { data: player } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("id", input.lobbyPlayerId)
    .single();
  if (!player) throw new Error("player not found");

  const details: MinesDetails = {
    mines: input.minesCount,
    mine_positions,
    revealed: [],
    status: "active",
  };

  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .insert({
      lobby_id: player.lobby_id,
      lobby_player_id: input.lobbyPlayerId,
      game: "mines",
      bet_amount_cents: input.betCents,
      payout_cents: 0,
      details,
    })
    .select("id")
    .single();
  if (betErr || !bet) throw new Error(betErr?.message ?? "insert bet failed");

  await publishLobby(player.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: input.lobbyPlayerId,
    balanceCents: newBal as number,
  });

  return {
    betId: bet.id,
    minesCount: input.minesCount,
    multiplierAtFirstClick: minesMultiplier(input.minesCount, 1),
    newBalanceCents: newBal as number,
  };
}

export type MinesRevealInput = {
  lobbyPlayerId: string;
  betId: string;
  tileIndex: number;
};

export type MinesRevealResult = {
  exploded: boolean;
  revealed: number[];
  multiplier: number;
  /** Only set when exploded. */
  minePositions?: number[];
};

export async function revealMinesTile(
  input: MinesRevealInput
): Promise<MinesRevealResult> {
  if (input.tileIndex < 0 || input.tileIndex >= MINES_TILES) {
    throw new Error("tile out of range");
  }
  const supabase = getServiceSupabase();
  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "mines") throw new Error("wrong game");

  const details = bet.details as MinesDetails;
  if (details.status !== "active") throw new Error("game not active");
  if (details.revealed.includes(input.tileIndex)) {
    throw new Error("tile already revealed");
  }

  const isMine = details.mine_positions.includes(input.tileIndex);
  if (isMine) {
    const nextDetails: MinesDetails = { ...details, status: "exploded" };
    await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    return {
      exploded: true,
      revealed: details.revealed,
      multiplier: 0,
      minePositions: details.mine_positions,
    };
  }

  const nextRevealed = [...details.revealed, input.tileIndex].sort((a, b) => a - b);
  const nextDetails: MinesDetails = { ...details, revealed: nextRevealed };
  await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);

  return {
    exploded: false,
    revealed: nextRevealed,
    multiplier: minesMultiplier(details.mines, nextRevealed.length),
  };
}

export type MinesCashoutInput = {
  lobbyPlayerId: string;
  betId: string;
};

export type MinesCashoutResult = {
  payoutCents: number;
  multiplier: number;
  newBalanceCents: number;
};

export async function cashoutMinesGame(
  input: MinesCashoutInput
): Promise<MinesCashoutResult> {
  const supabase = getServiceSupabase();
  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game, bet_amount_cents")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "mines") throw new Error("wrong game");

  const details = bet.details as MinesDetails;
  if (details.status !== "active") throw new Error("game not active");
  if (details.revealed.length === 0) throw new Error("nothing to cash out");

  const multiplier = minesMultiplier(details.mines, details.revealed.length);
  const payoutCents = Math.floor(bet.bet_amount_cents * multiplier);

  const { data: newBal, error: creditErr } = await supabase.rpc("credit_balance", {
    p_player_id: input.lobbyPlayerId,
    p_amount_cents: payoutCents,
  });
  if (creditErr) throw new Error(creditErr.message);

  const nextDetails: MinesDetails = { ...details, status: "cashed_out" };
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
  };
}
