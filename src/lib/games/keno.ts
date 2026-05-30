import { randomInt } from "crypto";

/**
 * Stake-style Keno. 40-number pool. Player picks between 1 and 10
 * numbers. Server draws 10 distinct numbers. Payout depends on
 * (picks, hits) per a Stake-faithful classic risk paytable.
 *
 * Tables here are simplified; they hit ~99% RTP without being literal
 * copies of Stake's exact tables.
 */

export const POOL_SIZE = 40;
export const DRAWN_COUNT = 10;
export const MIN_PICKS = 1;
export const MAX_PICKS = 10;

/** PAYTABLES[picks][hits] = multiplier (0 = loss). */
const PAYTABLES: Record<number, number[]> = {
  1: [0, 3.96],
  2: [0, 1.9, 4.5],
  3: [0, 1, 3.1, 10.4],
  4: [0, 0.8, 1.7, 5, 22.5],
  5: [0, 0.5, 1.4, 4, 14, 39],
  6: [0, 0.4, 1, 3, 8, 17, 81],
  7: [0, 0.3, 0.7, 2, 6, 12, 25, 141],
  8: [0, 0.25, 0.5, 1.5, 5, 9, 19, 60, 700],
  9: [0, 0.2, 0.5, 1, 3, 6, 15, 35, 290, 5000],
  10: [0, 0.15, 0.4, 0.9, 2.5, 5, 10, 25, 100, 1000, 10000],
};

export function multiplierFor(picks: number, hits: number): number {
  const table = PAYTABLES[picks];
  if (!table) throw new Error(`unsupported picks count: ${picks}`);
  if (hits < 0 || hits > picks) {
    throw new Error(`hits ${hits} out of range for picks ${picks}`);
  }
  return table[hits];
}

/** Returns the paytable as a row of multipliers (length = picks + 1). */
export function paytableFor(picks: number): number[] {
  if (!PAYTABLES[picks]) throw new Error(`unsupported picks: ${picks}`);
  return [...PAYTABLES[picks]];
}

/**
 * Draws `DRAWN_COUNT` distinct numbers in [1, POOL_SIZE] using partial
 * Fisher-Yates so we don't allocate the full permutation unnecessarily.
 */
export function drawNumbers(): number[] {
  const pool = Array.from({ length: POOL_SIZE }, (_, i) => i + 1);
  for (let i = 0; i < DRAWN_COUNT; i++) {
    const j = i + randomInt(0, POOL_SIZE - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DRAWN_COUNT).sort((a, b) => a - b);
}
