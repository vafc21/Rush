import { getServiceSupabase } from "@/lib/db/supabase";
import {
  drawCard,
  Card,
  Direction,
  stepMultiplier,
  withRtp,
} from "@/lib/games/hilo";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { maybeBustPlayer } from "@/lib/games/bust";

type HiloDetails = {
  startCard: Card;
  currentCard: Card;
  history: Array<{
    from: Card;
    direction: Direction;
    drawn: Card;
    correct: boolean;
  }>;
  rawMultiplier: number; // before RTP, accumulates from each correct guess
  status: "active" | "cashed_out" | "lost";
};

export type StartInput = {
  lobbyPlayerId: string;
  betCents: number;
};

export type StartResult = {
  betId: string;
  startCard: Card;
  newBalanceCents: number;
};

export async function startHilo(input: StartInput): Promise<StartResult> {
  if (input.betCents < MIN_BET_CENTS) throw new Error("bet below minimum");
  if (input.betCents > MAX_BET_CENTS) throw new Error("bet exceeds maximum");

  const supabase = getServiceSupabase();

  const { data: afterDeduct, error: dedErr } = await supabase.rpc(
    "deduct_balance",
    { p_player_id: input.lobbyPlayerId, p_amount_cents: input.betCents }
  );
  if (dedErr) throw new Error(dedErr.message);
  if (afterDeduct === null || afterDeduct === undefined) {
    throw new Error("insufficient balance");
  }

  const startCard = drawCard();
  const { data: player } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("id", input.lobbyPlayerId)
    .single();
  if (!player) throw new Error("player not found");

  const details: HiloDetails = {
    startCard,
    currentCard: startCard,
    history: [],
    rawMultiplier: 1,
    status: "active",
  };

  const { data: bet, error: betErr } = await supabase
    .from("bets")
    .insert({
      lobby_id: player.lobby_id,
      lobby_player_id: input.lobbyPlayerId,
      game: "hilo",
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
    balanceCents: afterDeduct as number,
  });

  return {
    betId: bet.id,
    startCard,
    newBalanceCents: afterDeduct as number,
  };
}

export type GuessInput = {
  lobbyPlayerId: string;
  betId: string;
  direction: Direction;
};

export type GuessResult = {
  correct: boolean;
  drawn: Card;
  currentCard: Card;
  rawMultiplier: number;
  cashoutMultiplier: number;
  status: "active" | "lost";
};

export async function guessHilo(input: GuessInput): Promise<GuessResult> {
  const supabase = getServiceSupabase();
  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "hilo") throw new Error("wrong game");

  const details = bet.details as HiloDetails;
  if (details.status !== "active") throw new Error("game not active");

  // Disallow guesses with zero probability of success
  const stepMult = stepMultiplier(input.direction, details.currentCard.rank);
  if (!Number.isFinite(stepMult)) {
    throw new Error("impossible guess for this card — pick the other direction");
  }

  const drawn = drawCard();
  const beatRank =
    input.direction === "higher"
      ? drawn.rank > details.currentCard.rank
      : drawn.rank < details.currentCard.rank;

  const nextHistory = [
    ...details.history,
    {
      from: details.currentCard,
      direction: input.direction,
      drawn,
      correct: beatRank,
    },
  ];

  if (!beatRank) {
    const nextDetails: HiloDetails = {
      ...details,
      currentCard: drawn,
      history: nextHistory,
      status: "lost",
    };
    await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    // The stake was deducted at start; a loss may bust the player.
    await maybeBustPlayer(bet.lobby_id, input.lobbyPlayerId);
    return {
      correct: false,
      drawn,
      currentCard: drawn,
      rawMultiplier: details.rawMultiplier,
      cashoutMultiplier: 0,
      status: "lost",
    };
  }

  const nextRaw = details.rawMultiplier * stepMult;
  const nextDetails: HiloDetails = {
    ...details,
    currentCard: drawn,
    history: nextHistory,
    rawMultiplier: nextRaw,
  };
  await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);

  return {
    correct: true,
    drawn,
    currentCard: drawn,
    rawMultiplier: nextRaw,
    cashoutMultiplier: withRtp(nextRaw),
    status: "active",
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
};

export async function cashoutHilo(input: CashoutInput): Promise<CashoutResult> {
  const supabase = getServiceSupabase();
  const { data: bet, error: lookupErr } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, details, game, bet_amount_cents")
    .eq("id", input.betId)
    .single();
  if (lookupErr || !bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "hilo") throw new Error("wrong game");

  const details = bet.details as HiloDetails;
  if (details.status !== "active") throw new Error("game not active");
  if (details.history.length === 0) throw new Error("nothing to cash out");

  const multiplier = withRtp(details.rawMultiplier);
  const payoutCents = Math.floor(bet.bet_amount_cents * multiplier);

  const { data: newBal, error: creditErr } = await supabase.rpc(
    "credit_balance",
    { p_player_id: input.lobbyPlayerId, p_amount_cents: payoutCents }
  );
  if (creditErr) throw new Error(creditErr.message);

  const nextDetails: HiloDetails = { ...details, status: "cashed_out" };
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
