import { getServiceSupabase } from "@/lib/db/supabase";
import { diceOutcome, MIN_ROLL_UNDER, MAX_ROLL_UNDER } from "@/lib/games/dice";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { maybeBustPlayer } from "@/lib/games/bust";

export type DiceBetInput = {
  lobbyPlayerId: string;
  betCents: number;
  rollUnder: number;
  _forcedRoll?: number;
};

export type DiceBetResult = {
  won: boolean;
  roll: number;
  payoutCents: number;
  newBalanceCents: number;
};

export async function placeDiceBet(input: DiceBetInput): Promise<DiceBetResult> {
  if (input.betCents < MIN_BET_CENTS) throw new Error("bet below minimum");
  if (input.betCents > MAX_BET_CENTS) throw new Error("bet exceeds maximum");
  if (input.rollUnder < MIN_ROLL_UNDER || input.rollUnder > MAX_ROLL_UNDER) {
    throw new Error("invalid rollUnder");
  }

  const supabase = getServiceSupabase();

  const { data: newBal, error: deductErr } = await supabase.rpc("deduct_balance", {
    p_player_id: input.lobbyPlayerId,
    p_amount_cents: input.betCents,
  });
  if (deductErr) throw new Error(deductErr.message);
  if (newBal === null || newBal === undefined) {
    throw new Error("insufficient balance");
  }

  const outcome = diceOutcome({
    rollUnder: input.rollUnder,
    betCents: input.betCents,
    forcedRoll: input._forcedRoll,
  });

  let finalBalance = newBal as number;
  if (outcome.payoutCents > 0) {
    const { data: bumped, error: bumpErr } = await supabase.rpc("credit_balance", {
      p_player_id: input.lobbyPlayerId,
      p_amount_cents: outcome.payoutCents,
    });
    if (bumpErr) throw new Error(bumpErr.message);
    finalBalance = bumped as number;
  }

  const { data: player } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("id", input.lobbyPlayerId)
    .single();
  if (!player) throw new Error("player not found");

  await supabase.from("bets").insert({
    lobby_id: player.lobby_id,
    lobby_player_id: input.lobbyPlayerId,
    game: "dice",
    bet_amount_cents: input.betCents,
    payout_cents: outcome.payoutCents,
    details: outcome.details,
  });

  await publishLobby(player.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: input.lobbyPlayerId,
    balanceCents: finalBalance,
  });

  // Bust check
  await maybeBustPlayer(player.lobby_id, input.lobbyPlayerId, finalBalance);

  return {
    won: outcome.won,
    roll: outcome.roll,
    payoutCents: outcome.payoutCents,
    newBalanceCents: finalBalance,
  };
}
