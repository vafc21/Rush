import { describe, it, expect } from "vitest";
import {
  rollCrashPoint,
  multiplierAtElapsed,
  secondsToReachMultiplier,
  GROWTH_RATE,
} from "@/lib/games/crash";

describe("rollCrashPoint", () => {
  it("returns values in [1, large) for many rolls", () => {
    for (let i = 0; i < 1000; i++) {
      const c = rollCrashPoint();
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThan(1e6);
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it("roughly matches the Stake-style distribution", () => {
    const trials = 100_000;
    let below2 = 0;
    let below10 = 0;
    for (let i = 0; i < trials; i++) {
      const c = rollCrashPoint();
      if (c < 2) below2++;
      if (c < 10) below10++;
    }
    // Theoretical: P(crash < x) = 1 - 99/(100x) for x > 0.99
    // P(< 2)  ≈ 0.505
    // P(< 10) ≈ 0.901
    expect(below2 / trials).toBeGreaterThan(0.46);
    expect(below2 / trials).toBeLessThan(0.55);
    expect(below10 / trials).toBeGreaterThan(0.88);
    expect(below10 / trials).toBeLessThan(0.92);
  });

  it("delivers ~99% RTP at fixed cashout targets", () => {
    const trials = 50_000;
    const targets = [1.5, 2, 5, 10];
    for (const target of targets) {
      let totalReturn = 0;
      for (let i = 0; i < trials; i++) {
        const crash = rollCrashPoint();
        if (crash >= target) totalReturn += target;
        // else lose the bet
      }
      const rtp = totalReturn / trials; // bet=1
      expect(rtp).toBeGreaterThan(0.95);
      expect(rtp).toBeLessThan(1.03);
    }
  });
});

describe("multiplierAtElapsed / secondsToReachMultiplier", () => {
  it("multiplier at t=0 is exactly 1", () => {
    expect(multiplierAtElapsed(0)).toBe(1);
  });

  it("is monotonically increasing", () => {
    let prev = multiplierAtElapsed(0);
    for (let s = 0.1; s < 100; s += 0.1) {
      const next = multiplierAtElapsed(s);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
  });

  it("round-trips: secondsToReach(multiplierAtElapsed(t)) ≈ t", () => {
    for (const t of [0.5, 1, 5, 10, 30, 60]) {
      expect(secondsToReachMultiplier(multiplierAtElapsed(t))).toBeCloseTo(t, 8);
    }
  });

  it("growth rate hits sensible milestones", () => {
    // With GROWTH_RATE = 0.06 per second, 2x in ~11.55s, 10x in ~38s
    expect(secondsToReachMultiplier(2)).toBeCloseTo(Math.log(2) / GROWTH_RATE, 5);
    expect(secondsToReachMultiplier(10)).toBeCloseTo(Math.log(10) / GROWTH_RATE, 5);
  });

  it("rejects multipliers below 1", () => {
    expect(() => secondsToReachMultiplier(0.5)).toThrow();
  });
});
