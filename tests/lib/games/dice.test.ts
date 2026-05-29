import { describe, it, expect } from "vitest";
import {
  diceMultiplier,
  rollDice,
  diceOutcome,
  MIN_ROLL_UNDER,
  MAX_ROLL_UNDER,
} from "@/lib/games/dice";

describe("diceMultiplier", () => {
  it("matches 99 / X for the supported range", () => {
    expect(diceMultiplier(50)).toBeCloseTo(1.98, 2);
    expect(diceMultiplier(10)).toBeCloseTo(9.9, 2);
    expect(diceMultiplier(2)).toBeCloseTo(49.5, 2);
    expect(diceMultiplier(98)).toBeCloseTo(1.0102, 3);
  });

  it("throws for out-of-range targets", () => {
    expect(() => diceMultiplier(MIN_ROLL_UNDER - 1)).toThrow();
    expect(() => diceMultiplier(MAX_ROLL_UNDER + 1)).toThrow();
  });
});

describe("rollDice", () => {
  it("returns numbers in [0, 100)", () => {
    for (let i = 0; i < 1000; i++) {
      const r = rollDice();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(100);
    }
  });
});

describe("diceOutcome RTP", () => {
  it("delivers ~99% RTP across 100k rolls at target 50", () => {
    const bet = 100;
    const target = 50;
    let totalPayout = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      totalPayout += diceOutcome({ rollUnder: target, betCents: bet }).payoutCents;
    }
    const rtp = totalPayout / (bet * N);
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(1.02);
  });
});
