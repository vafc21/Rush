import { randomInt } from "crypto";

/**
 * Crate Run — a sidescroller-themed crate (CS:GO case / PackDraw style)
 * opening game. The player bets, picks a difficulty, and a crate bursts
 * open into one of eight color-rarity tiers. Each tier pays a fixed
 * multiplier on the bet.
 *
 * The outcome is decided SERVER-SIDE here (crypto.randomInt); the client
 * only animates the tier it is handed. Each difficulty is an explicit
 * table of {tier, color, probability, multiplier}. Probabilities sum to
 * 1 and are tuned so player EV < 1 (the house keeps an edge):
 *
 *   easy   EV ~0.95  (~5% edge)  — soft 0.5x floor, 200x jackpot @ ~1/2,000
 *   normal EV ~0.92  (~8% edge)  — the base ladder, 500x jackpot @ ~1/4,167
 *   hard   EV ~0.82  (~18% edge) — harsh 0.1x floor, 2000x jackpot @ ~1/12,500
 *
 * EV = sum(probability * multiplier) per difficulty. These tables are the
 * authoritative published odds; the server never lets the client decide.
 */

export type Difficulty = "easy" | "normal" | "hard";

/** Rarity tiers, ascending. `color` is the rarity color shown by the UI. */
export type Tier =
  | "gray"
  | "white"
  | "light_blue"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "gold";

export type TierConfig = {
  tier: Tier;
  /** Display label for the rarity color. */
  color: string;
  /** Hex used to paint the result (rarity color). */
  hex: string;
  probability: number;
  multiplier: number;
};

const COLOR_META: Record<Tier, { color: string; hex: string }> = {
  gray: { color: "Gray", hex: "#7B8BA8" },
  white: { color: "White", hex: "#E9EEF5" },
  light_blue: { color: "Light Blue", hex: "#5BC8FF" },
  blue: { color: "Blue", hex: "#2D6BFF" },
  purple: { color: "Purple", hex: "#9B5BFF" },
  pink: { color: "Pink", hex: "#FF5BD1" },
  red: { color: "Red", hex: "#FF4444" },
  gold: { color: "Gold", hex: "#FFB800" },
};

/** Build a tier table from a {tier -> [probability, multiplier]} spec. */
function buildTable(
  spec: Array<[tier: Tier, probability: number, multiplier: number]>
): TierConfig[] {
  return spec.map(([tier, probability, multiplier]) => ({
    tier,
    color: COLOR_META[tier].color,
    hex: COLOR_META[tier].hex,
    probability,
    multiplier,
  }));
}

export const DIFFICULTY_TABLES: Record<Difficulty, TierConfig[]> = {
  // EV = 0.95135 (~4.9% edge). Softer 0.5x floor, more break-even 1x hits.
  easy: buildTable([
    ["gray", 0.4497, 0.5],
    ["white", 0.21, 0.5],
    ["light_blue", 0.3, 1],
    ["blue", 0.03, 3],
    ["purple", 0.008, 8],
    ["pink", 0.0015, 25],
    ["red", 0.0003, 100],
    ["gold", 0.0005, 200],
  ]),
  // EV = 0.91595 (~8.4% edge). The base ladder from the design spec.
  normal: buildTable([
    ["gray", 0.57976, 0.2],
    ["white", 0.24, 0.5],
    ["light_blue", 0.12, 1],
    ["blue", 0.04, 3],
    ["purple", 0.015, 8],
    ["pink", 0.004, 25],
    ["red", 0.001, 100],
    ["gold", 0.00024, 500],
  ]),
  // EV = 0.81241 (~18.8% edge). Harsh 0.1x floor, fat 2000x jackpot.
  hard: buildTable([
    ["gray", 0.61412, 0.1],
    ["white", 0.18, 0.5],
    ["light_blue", 0.16, 1],
    ["blue", 0.03, 3],
    ["purple", 0.012, 8],
    ["pink", 0.003, 25],
    ["red", 0.0008, 100],
    ["gold", 0.00008, 2000],
  ]),
};

export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export function tableFor(difficulty: Difficulty): TierConfig[] {
  return [...DIFFICULTY_TABLES[difficulty]];
}

/** Expected value (return-to-player) of a difficulty: sum(p * multiplier). */
export function expectedValue(difficulty: Difficulty): number {
  return DIFFICULTY_TABLES[difficulty].reduce(
    (sum, t) => sum + t.probability * t.multiplier,
    0
  );
}

// Integer resolution for weighted sampling. All published probabilities are
// exact at <=5 decimal places, so probability * RESOLUTION is an integer and
// the sampled distribution matches the published table exactly.
const RESOLUTION = 10_000_000;

/**
 * Open a crate at the given difficulty. Returns the rolled tier and its
 * multiplier. `forcedRoll` (an integer in [0, RESOLUTION)) is for tests.
 */
export function openCrate(
  difficulty: Difficulty,
  forcedRoll?: number
): TierConfig {
  const table = DIFFICULTY_TABLES[difficulty];
  const roll = forcedRoll ?? randomInt(0, RESOLUTION);
  let cursor = 0;
  for (const t of table) {
    cursor += Math.round(t.probability * RESOLUTION);
    if (roll < cursor) return t;
  }
  // Float-rounding fallback: hand back the rarest (last) tier.
  return table[table.length - 1];
}

export type CrateOutcome = {
  payoutCents: number;
  tier: Tier;
  color: string;
  hex: string;
  multiplier: number;
};

/** Resolve a full bet: roll a crate and compute the payout. */
export function crateOutcome(opts: {
  difficulty: Difficulty;
  betCents: number;
  forcedRoll?: number;
}): CrateOutcome {
  const result = openCrate(opts.difficulty, opts.forcedRoll);
  return {
    payoutCents: Math.floor(opts.betCents * result.multiplier),
    tier: result.tier,
    color: result.color,
    hex: result.hex,
    multiplier: result.multiplier,
  };
}
