import { getServiceSupabase } from "@/lib/db/supabase";
import {
  Card,
  drawCard,
  evaluate,
  dealerShouldHit,
  settle,
  isBlackjack,
} from "@/lib/games/blackjack";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { publishLobby } from "@/lib/realtime/pusher-server";

type BlackjackDetails = {
  player: Card[];
  dealer: Card[];           // While player is active, only dealer[0] is shown to UI; dealer[1] is the hole card.
  doubled: boolean;
  status: "player_turn" | "settled";
  result?:
    | "player_blackjack"
    | "dealer_blackjack"
    | "win"
    | "lose"
    | "push";
};

export type StartInput = { lobbyPlayerId: string; betCents: number };
export type StartResult = {
  betId: string;
  player: Card[];
  dealerVisible: Card;
  status: "player_turn" | "settled";
  result?: BlackjackDetails["result"];
  payoutCents?: number;
  newBalanceCents: number;
  dealer?: Card[];
};

export async function startBlackjack(input: StartInput): Promise<StartResult> {
  if (input.betCents < MIN_BET_CENTS) throw new Error("bet below minimum");
  if (input.betCents > MAX_BET_CENTS) throw new Error("bet exceeds maximum");

  const supabase = getServiceSupabase();
  const { data: afterDeduct, error: dedErr } = await supabase.rpc("deduct_balance", {
    p_player_id: input.lobbyPlayerId,
    p_amount_cents: input.betCents,
  });
  if (dedErr) throw new Error(dedErr.message);
  if (afterDeduct === null) throw new Error("insufficient balance");

  const player = [drawCard(), drawCard()];
  const dealer = [drawCard(), drawCard()];

  const { data: pl } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("id", input.lobbyPlayerId)
    .single();
  if (!pl) throw new Error("player not found");

  // Auto-settle naturals
  let status: BlackjackDetails["status"] = "player_turn";
  let result: BlackjackDetails["result"] | undefined;
  let payoutCents = 0;
  let finalBalance = afterDeduct as number;

  if (isBlackjack(player) || isBlackjack(dealer)) {
    status = "settled";
    const s = settle(player, dealer);
    result = s.result;
    payoutCents = Math.floor(input.betCents * s.payoutMultiplier);
    if (payoutCents > 0) {
      const { data: bumped } = await supabase.rpc("credit_balance", {
        p_player_id: input.lobbyPlayerId,
        p_amount_cents: payoutCents,
      });
      finalBalance = bumped as number;
    }
  }

  const details: BlackjackDetails = {
    player,
    dealer,
    doubled: false,
    status,
    result,
  };

  const { data: bet } = await supabase
    .from("bets")
    .insert({
      lobby_id: pl.lobby_id,
      lobby_player_id: input.lobbyPlayerId,
      game: "blackjack",
      bet_amount_cents: input.betCents,
      payout_cents: payoutCents,
      details,
    })
    .select("id")
    .single();
  if (!bet) throw new Error("insert failed");

  await publishLobby(pl.lobby_id, {
    type: "balance_update",
    lobbyPlayerId: input.lobbyPlayerId,
    balanceCents: finalBalance,
  });

  return {
    betId: bet.id,
    player,
    dealerVisible: dealer[0],
    status,
    result,
    payoutCents: status === "settled" ? payoutCents : undefined,
    newBalanceCents: finalBalance,
    dealer: status === "settled" ? dealer : undefined,
  };
}

export type ActionInput = {
  lobbyPlayerId: string;
  betId: string;
  action: "hit" | "stand" | "double";
};

export type ActionResult = {
  player: Card[];
  dealer?: Card[];
  status: "player_turn" | "settled";
  result?: BlackjackDetails["result"];
  payoutCents?: number;
  newBalanceCents?: number;
};

export async function performAction(input: ActionInput): Promise<ActionResult> {
  const supabase = getServiceSupabase();
  const { data: bet } = await supabase
    .from("bets")
    .select("id, lobby_player_id, lobby_id, bet_amount_cents, details, game")
    .eq("id", input.betId)
    .single();
  if (!bet) throw new Error("bet not found");
  if (bet.lobby_player_id !== input.lobbyPlayerId) throw new Error("not your bet");
  if (bet.game !== "blackjack") throw new Error("wrong game");

  const details = bet.details as BlackjackDetails;
  if (details.status !== "player_turn") throw new Error("game not active");

  const player = [...details.player];
  let doubled = details.doubled;

  if (input.action === "hit") {
    player.push(drawCard());
  } else if (input.action === "double") {
    if (player.length !== 2) throw new Error("can only double on the opening hand");
    // Deduct again
    const { data: afterDeduct, error: dedErr } = await supabase.rpc("deduct_balance", {
      p_player_id: input.lobbyPlayerId,
      p_amount_cents: bet.bet_amount_cents,
    });
    if (dedErr) throw new Error(dedErr.message);
    if (afterDeduct === null) throw new Error("insufficient balance to double");
    doubled = true;
    player.push(drawCard());
  }
  // stand → fall through; settle below

  const pv = evaluate(player);
  const playerBust = pv.total > 21;
  const mustSettle =
    input.action === "stand" || input.action === "double" || playerBust;

  if (!mustSettle) {
    // hit but not bust → keep playing
    const nextDetails: BlackjackDetails = { ...details, player };
    await supabase.from("bets").update({ details: nextDetails }).eq("id", bet.id);
    return { player, status: "player_turn" };
  }

  // Dealer plays out (unless player busted)
  const dealer = [...details.dealer];
  if (!playerBust) {
    while (dealerShouldHit(dealer)) dealer.push(drawCard());
  }

  const effectiveBet = bet.bet_amount_cents * (doubled ? 2 : 1);
  const s = settle(player, dealer);
  const payoutCents = Math.floor(effectiveBet * s.payoutMultiplier);

  let newBal: number | undefined;
  if (payoutCents > 0) {
    const { data: bumped } = await supabase.rpc("credit_balance", {
      p_player_id: input.lobbyPlayerId,
      p_amount_cents: payoutCents,
    });
    newBal = bumped as number;
  } else {
    // No payout — fetch current balance for the broadcast
    const { data: ply } = await supabase
      .from("lobby_players")
      .select("balance_cents")
      .eq("id", input.lobbyPlayerId)
      .single();
    newBal = ply?.balance_cents;
  }

  const nextDetails: BlackjackDetails = {
    ...details,
    player,
    dealer,
    doubled,
    status: "settled",
    result: s.result,
  };
  await supabase
    .from("bets")
    .update({ payout_cents: payoutCents, details: nextDetails })
    .eq("id", bet.id);

  if (newBal !== undefined) {
    await publishLobby(bet.lobby_id, {
      type: "balance_update",
      lobbyPlayerId: input.lobbyPlayerId,
      balanceCents: newBal,
    });
  }

  return {
    player,
    dealer,
    status: "settled",
    result: s.result,
    payoutCents,
    newBalanceCents: newBal,
  };
}
