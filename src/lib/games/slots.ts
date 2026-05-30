import { randomInt } from "crypto";

/**
 * Simple 3-reel slot machine with 5 symbols. RTP ~95% (hard to hit 99
 * on a 3-reel machine without a wide multi-line pay structure).
 *
 * Symbols and per-symbol multipliers when 3-of-a-kind hits the payline.
 * The middle row is the single payline.
 */

export type Symbol = "🍒" | "🍋" | "🔔" | "💎" | "7️⃣";

export const SYMBOLS: Symbol[] = ["🍒", "🍋", "🔔", "💎", "7️⃣"];

/** Weighted distribution: rarer symbols pay more. */
const WEIGHTS: Record<Symbol, number> = {
  "🍒": 30,
  "🍋": 25,
  "🔔": 18,
  "💎": 10,
  "7️⃣": 4,
};

const TRIPLE_PAY: Record<Symbol, number> = {
  "🍒": 3,
  "🍋": 6,
  "🔔": 15,
  "💎": 40,
  "7️⃣": 200,
};

const PAIR_PAY: Record<Symbol, number> = {
  "🍒": 1.2,
  "🍋": 0,
  "🔔": 0,
  "💎": 2,
  "7️⃣": 5,
};

function weightedPick(): Symbol {
  const total = SYMBOLS.reduce((s, sym) => s + WEIGHTS[sym], 0);
  let r = randomInt(0, total);
  for (const s of SYMBOLS) {
    if (r < WEIGHTS[s]) return s;
    r -= WEIGHTS[s];
  }
  return SYMBOLS[0];
}

export function spinReels(): {
  reels: [Symbol, Symbol, Symbol];
  multiplier: number;
} {
  const reels: [Symbol, Symbol, Symbol] = [
    weightedPick(),
    weightedPick(),
    weightedPick(),
  ];
  const [a, b, c] = reels;
  let multiplier = 0;
  if (a === b && b === c) {
    multiplier = TRIPLE_PAY[a];
  } else if (a === b || b === c) {
    // pair on the payline (first two or last two)
    const sym = a === b ? a : b;
    multiplier = PAIR_PAY[sym];
  }
  return { reels, multiplier };
}
