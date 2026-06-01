import { randomInt } from "crypto";

/**
 * Stake-style segmented Wheel (main game, not the busted-player Last
 * Chance Wheel). The wheel has 50 segments. Each segment has a payout
 * multiplier; the payout distribution is configured per risk level so
 * total RTP across the wheel sits at ~99%.
 *
 * The wheel is rendered with N visual segments (any value the UI wants)
 * but the underlying probability table is what matters. We expose both
 * the segment count + per-segment multipliers so the UI can draw the
 * wheel and we can settle the bet server-side.
 */

export const SEGMENTS = 50;

export type Risk = "low" | "medium" | "high";

/**
 * Per-segment multipliers (0x = a losing slot). Each table is tuned so
 * the mean multiplier is just under 1.0 — i.e. the player loses a small
 * edge over time (~98-99% RTP), the way a real casino wheel works. Every
 * risk level has genuine 0x losing segments; higher risk = more losing
 * slots traded for bigger top multipliers.
 *
 *   low    20/50 lose (mean 0.99)  — low volatility, frequent 1.5x
 *   medium 25/50 lose (mean 0.99)  — 50/50, top 3x
 *   high   40/50 lose (mean 0.98)  — 80% lose, top 22x
 */
function buildTable(spec: Array<[count: number, multiplier: number]>): number[] {
  const arr: number[] = [];
  for (const [count, multiplier] of spec) {
    for (let i = 0; i < count; i++) arr.push(multiplier);
  }
  if (arr.length !== SEGMENTS) {
    throw new Error(`wheel table has ${arr.length} segments, expected ${SEGMENTS}`);
  }
  return arr;
}

const TABLES: Record<Risk, number[]> = {
  // sum = 49.5 → mean 0.99
  low: buildTable([
    [20, 0],
    [27, 1.5],
    [3, 3],
  ]),
  // sum = 49.5 → mean 0.99
  medium: buildTable([
    [25, 0],
    [15, 2],
    [7, 1.5],
    [3, 3],
  ]),
  // sum = 49 → mean 0.98
  high: buildTable([
    [40, 0],
    [6, 2],
    [3, 5],
    [1, 22],
  ]),
};

export function segmentsFor(risk: Risk): number[] {
  return [...TABLES[risk]];
}

export function spin(risk: Risk): { segment: number; multiplier: number } {
  const segment = randomInt(0, SEGMENTS);
  return { segment, multiplier: TABLES[risk][segment] };
}
