import { randomInt } from "crypto";
import type { BetOutcome } from "./types";

export const MIN_ROLL_UNDER = 2;
export const MAX_ROLL_UNDER = 98;
const RTP = 0.99;

/** Server-side roll in [0, 100). */
export function rollDice(): number {
  return randomInt(0, 10_000) / 100;
}

export function diceMultiplier(rollUnder: number): number {
  if (rollUnder < MIN_ROLL_UNDER || rollUnder > MAX_ROLL_UNDER) {
    throw new Error(`rollUnder out of range: ${rollUnder}`);
  }
  return (RTP * 100) / rollUnder;
}

export function diceOutcome(opts: {
  rollUnder: number;
  betCents: number;
  forcedRoll?: number;
}): BetOutcome & { roll: number; won: boolean } {
  const roll = opts.forcedRoll ?? rollDice();
  const won = roll < opts.rollUnder;
  const payoutCents = won
    ? Math.floor(opts.betCents * diceMultiplier(opts.rollUnder))
    : 0;
  return {
    payoutCents,
    won,
    roll,
    details: { rollUnder: opts.rollUnder, roll, multiplier: diceMultiplier(opts.rollUnder) },
  };
}
