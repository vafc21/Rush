import { randomInt } from "crypto";

export const MINES_TILES = 25;
export const MIN_MINES = 1;
export const MAX_MINES = 24;
const RTP = 0.99;

/**
 * Places `count` distinct mines on a 25-tile board. Uses a partial Fisher–
 * Yates shuffle so the result is uniformly random without allocating the
 * full permutation.
 */
export function placeMines(count: number): number[] {
  if (count < MIN_MINES || count > MAX_MINES) {
    throw new Error(`mines count out of range: ${count}`);
  }
  const indices: number[] = Array.from({ length: MINES_TILES }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    // pick j in [i, MINES_TILES)
    const j = i + randomInt(0, MINES_TILES - i);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = indices.slice(0, count);
  picked.sort((a, b) => a - b);
  return picked;
}

/**
 * Cumulative cashout multiplier after `clicksRevealed` safe tiles have been
 * clicked, on a board with `mines` mines. RTP is folded in: returns 1.0
 * for zero clicks (no winnings until you reveal something).
 */
export function minesMultiplier(mines: number, clicksRevealed: number): number {
  if (mines < MIN_MINES || mines > MAX_MINES) {
    throw new Error(`mines count out of range: ${mines}`);
  }
  const safeTotal = MINES_TILES - mines;
  if (clicksRevealed < 0 || clicksRevealed > safeTotal) {
    throw new Error(
      `clicksRevealed ${clicksRevealed} out of range for ${mines} mines`
    );
  }
  if (clicksRevealed === 0) return 1;
  let m = 1;
  for (let i = 0; i < clicksRevealed; i++) {
    m *= (MINES_TILES - i) / (MINES_TILES - mines - i);
  }
  return m * RTP;
}
