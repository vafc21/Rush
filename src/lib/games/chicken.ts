import { randomInt } from "crypto";

/**
 * Chicken — cross the road. The chicken advances one lane at a time. Each
 * lane it survives bumps the cashout multiplier; each lane also carries a
 * fixed chance of a car running it over, which ends the game with zero
 * payout. The player can cash out after crossing at least one lane.
 *
 * With a constant per-lane survival probability `p`, the cashout multiplier
 * after crossing `n` lanes is RTP * (1/p)^n. Because the expected value of
 * advancing one more lane is exactly the current stake (p * mult/p = mult),
 * the house edge is baked in once at the start and the RTP is the same no
 * matter which lane you cash out on.
 */

export const CHICKEN_LANES = 20;
const RTP = 0.99;

export type Difficulty = "easy" | "medium" | "hard";

type DifficultySpec = {
  /** Probability of safely crossing a single lane. */
  survival: number;
};

const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: { survival: 0.91 }, // ~9% to get hit per lane — slow, steady climb
  medium: { survival: 0.79 }, // ~21% per lane — punchier multipliers
  hard: { survival: 0.61 }, // ~39% per lane — high risk, fast multipliers
};

export function survivalProb(difficulty: Difficulty): number {
  return DIFFICULTIES[difficulty].survival;
}

/**
 * Roll the (1-indexed) lane on which a car hits the chicken. The whole run
 * is pre-committed at start, mirroring Dragon Tower placing its dragons up
 * front. Returns a value in [1, CHICKEN_LANES]; if the chicken would clear
 * every lane we return CHICKEN_LANES + 1 (a clean run, no crash).
 */
export function rollCrashLane(difficulty: Difficulty): number {
  const p = survivalProb(difficulty);
  for (let lane = 1; lane <= CHICKEN_LANES; lane++) {
    // randomInt(0, 1_000_000) / 1_000_000 → uniform in [0, 1)
    const r = randomInt(0, 1_000_000) / 1_000_000;
    if (r >= p) return lane; // hit on this lane
  }
  return CHICKEN_LANES + 1;
}

/**
 * Cumulative cashout multiplier after crossing `lanesCrossed` lanes. Returns
 * 1.0 for 0 lanes (nothing banked yet).
 */
export function chickenMultiplier(
  difficulty: Difficulty,
  lanesCrossed: number
): number {
  if (lanesCrossed < 0 || lanesCrossed > CHICKEN_LANES) {
    throw new Error(`lanesCrossed out of range: ${lanesCrossed}`);
  }
  if (lanesCrossed === 0) return 1;
  const p = survivalProb(difficulty);
  return Math.pow(1 / p, lanesCrossed) * RTP;
}
