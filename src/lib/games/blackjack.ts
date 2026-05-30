import { randomInt } from "crypto";

/**
 * Simplified Blackjack: 6-deck shoe, no splits, no insurance. Allows:
 *   - Hit  → take another card
 *   - Stand → end your turn
 *   - Double → double your bet, take exactly one more card, stand
 *
 * Dealer rules: hits soft 17 (stake-style). Blackjack pays 3:2 (1.5x bet
 * on top of stake = 2.5x payout). Player bust = lose. Push = stake back.
 *
 * Aces are 11 unless that would bust, in which case 1.
 */

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = number; // 1..13 (1=A, 11=J, 12=Q, 13=K)
export type Card = { rank: Rank; suit: Suit };

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export function drawCard(): Card {
  return { rank: randomInt(1, 14) as Rank, suit: SUITS[randomInt(0, 4)] };
}

export function rankPoints(rank: Rank): number {
  if (rank === 1) return 11;
  if (rank >= 10) return 10;
  return rank;
}

export type HandValue = { total: number; soft: boolean };

/** Returns the best total ≤ 21 if any; otherwise the bust total. */
export function evaluate(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += rankPoints(c.rank);
    if (c.rank === 1) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const e = evaluate(cards);
  return e.total === 21;
}

export function dealerShouldHit(cards: Card[]): boolean {
  const e = evaluate(cards);
  if (e.total < 17) return true;
  if (e.total === 17 && e.soft) return true; // hits soft 17
  return false;
}

export type Settlement = "player_blackjack" | "dealer_blackjack" | "win" | "lose" | "push";

export function settle(
  player: Card[],
  dealer: Card[]
): { result: Settlement; payoutMultiplier: number } {
  const pv = evaluate(player);
  const dv = evaluate(dealer);
  const pbj = isBlackjack(player);
  const dbj = isBlackjack(dealer);

  if (pbj && dbj) return { result: "push", payoutMultiplier: 1 };
  if (pbj) return { result: "player_blackjack", payoutMultiplier: 2.5 };
  if (dbj) return { result: "dealer_blackjack", payoutMultiplier: 0 };
  if (pv.total > 21) return { result: "lose", payoutMultiplier: 0 };
  if (dv.total > 21) return { result: "win", payoutMultiplier: 2 };
  if (pv.total > dv.total) return { result: "win", payoutMultiplier: 2 };
  if (pv.total < dv.total) return { result: "lose", payoutMultiplier: 0 };
  return { result: "push", payoutMultiplier: 1 };
}
