import { randomInt } from "crypto";

/**
 * Plinko: a ball drops through ROWS levels of pegs, bouncing left or
 * right at each row (each bounce is a fair coin flip). After ROWS
 * bounces the ball lands in one of (ROWS + 1) slots — slot 0 is the
 * far-left edge case (all lefts), slot ROWS is the far-right edge case
 * (all rights). The middle slots have the highest probability via
 * the binomial distribution.
 *
 * Multipliers are arranged symmetrically: low in the middle, high at
 * the edges (so a ball that lands in slot ROWS/2 wins least; a ball
 * that lands at slot 0 or slot ROWS wins most). We provide three risk
 * tiers (Stake-style) trading off the edge-slot multiplier against
 * the middle-slot multiplier. All tiers target 99% RTP.
 */

export const ROWS = 16;
export const SLOTS = ROWS + 1;

export type Risk = "low" | "medium" | "high";

/**
 * Multiplier tables (Stake-faithful for 16 rows). Slot k corresponds
 * to the ball ending with k right-bounces and (ROWS - k) left-bounces.
 * Tables are symmetric (k and ROWS-k have the same multiplier).
 */
const TABLES: Record<Risk, number[]> = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

export function multiplierFor(risk: Risk, slot: number): number {
  const t = TABLES[risk];
  if (slot < 0 || slot >= t.length) throw new Error(`slot out of range: ${slot}`);
  return t[slot];
}

/** Returns the full multiplier table for a risk level (UI uses this to render the row of slots). */
export function multiplierTable(risk: Risk): number[] {
  return [...TABLES[risk]];
}

/**
 * Server-side bounce simulation. Returns the array of L/R decisions
 * (`true` = right) per row plus the final slot index.
 */
export function dropBall(): { path: boolean[]; slot: number } {
  const path: boolean[] = [];
  let rights = 0;
  for (let i = 0; i < ROWS; i++) {
    const goRight = randomInt(0, 2) === 1;
    path.push(goRight);
    if (goRight) rights++;
  }
  return { path, slot: rights };
}
