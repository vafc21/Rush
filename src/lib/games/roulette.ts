import { randomInt } from "crypto";

/**
 * European single-zero roulette. Numbers 0..36. 0 is green, 1..36 alternate
 * red/black per the standard wheel layout. Standard bet types supported:
 *
 *   - single n               (35:1)
 *   - red / black            (1:1)
 *   - odd / even             (1:1) — 0 loses
 *   - low (1-18) / high (19-36) (1:1) — 0 loses
 *   - dozen 1/2/3            (2:1)
 *   - column 1/2/3           (2:1)
 *
 * House edge: 1/37 ≈ 2.7% (this is the European-roulette intrinsic edge;
 * we don't apply a separate RTP factor since the edge comes from 0 alone).
 */

export const SLOTS = 37; // 0..36

const REDS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type Bet =
  | { kind: "single"; n: number }
  | { kind: "color"; color: "red" | "black" }
  | { kind: "parity"; parity: "odd" | "even" }
  | { kind: "half"; half: "low" | "high" }
  | { kind: "dozen"; dozen: 1 | 2 | 3 }
  | { kind: "column"; column: 1 | 2 | 3 };

export function colorOf(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return REDS.has(n) ? "red" : "black";
}

export function spinRoulette(): number {
  return randomInt(0, SLOTS);
}

/**
 * Returns the payout multiplier on a winning bet (including return of
 * the stake). Loss returns 0. Examples:
 *   single hit → 36 (35 profit + 1 stake)
 *   red hit    → 2  (1 profit + 1 stake)
 */
export function settle(bet: Bet, n: number): number {
  switch (bet.kind) {
    case "single":
      return n === bet.n ? 36 : 0;
    case "color":
      if (n === 0) return 0;
      return colorOf(n) === bet.color ? 2 : 0;
    case "parity":
      if (n === 0) return 0;
      return (n % 2 === 0 ? "even" : "odd") === bet.parity ? 2 : 0;
    case "half":
      if (n === 0) return 0;
      return (bet.half === "low" ? n >= 1 && n <= 18 : n >= 19 && n <= 36) ? 2 : 0;
    case "dozen": {
      if (n === 0) return 0;
      const d = Math.ceil(n / 12);
      return d === bet.dozen ? 3 : 0;
    }
    case "column": {
      if (n === 0) return 0;
      const c = ((n - 1) % 3) + 1;
      return c === bet.column ? 3 : 0;
    }
  }
}
