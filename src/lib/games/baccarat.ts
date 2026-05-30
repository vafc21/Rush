import { randomInt } from "crypto";

/**
 * Mini-baccarat. Player bets on Player, Banker, or Tie.
 *
 * Card values: A=1, 2-9 face value, 10/J/Q/K=0. A hand's total is the
 * sum of its cards mod 10.
 *
 * Standard third-card rules ("the tableau") apply. Payouts:
 *   - Player win: 2x  (1:1)
 *   - Banker win: 1.95x (1:1 minus 5% commission)
 *   - Tie:        9x  (8:1)
 */

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Card = { rank: number; suit: Suit };

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export function drawCard(): Card {
  return { rank: randomInt(1, 14), suit: SUITS[randomInt(0, 4)] };
}

export function cardValue(rank: number): number {
  if (rank >= 10) return 0;
  return rank; // A=1, 2..9 face
}

export function handTotal(cards: Card[]): number {
  return cards.reduce((s, c) => s + cardValue(c.rank), 0) % 10;
}

export type Side = "player" | "banker" | "tie";

const PAYOUT: Record<Side, number> = {
  player: 2,
  banker: 1.95,
  tie: 9,
};

export function payoutMultiplier(side: Side): number {
  return PAYOUT[side];
}

export function dealHand(): {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: Side;
} {
  const player = [drawCard(), drawCard()];
  const banker = [drawCard(), drawCard()];

  const naturalP = handTotal(player) >= 8;
  const naturalB = handTotal(banker) >= 8;

  if (!naturalP && !naturalB) {
    const pTotal = handTotal(player);
    // Player's third card
    if (pTotal <= 5) {
      player.push(drawCard());
    }
    // Banker's third card (per tableau)
    const bTotal = handTotal(banker);
    const playerThird =
      player.length === 3 ? cardValue(player[2].rank) : undefined;
    let bankerDraws = false;
    if (player.length === 2) {
      bankerDraws = bTotal <= 5;
    } else {
      const pt = playerThird!;
      if (bTotal <= 2) bankerDraws = true;
      else if (bTotal === 3) bankerDraws = pt !== 8;
      else if (bTotal === 4) bankerDraws = pt >= 2 && pt <= 7;
      else if (bTotal === 5) bankerDraws = pt >= 4 && pt <= 7;
      else if (bTotal === 6) bankerDraws = pt === 6 || pt === 7;
    }
    if (bankerDraws) banker.push(drawCard());
  }

  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const winner: Side =
    playerTotal > bankerTotal ? "player" : playerTotal < bankerTotal ? "banker" : "tie";

  return { player, banker, playerTotal, bankerTotal, winner };
}
