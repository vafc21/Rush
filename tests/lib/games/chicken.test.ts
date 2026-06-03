import { describe, it, expect } from "vitest";
import {
  CHICKEN_LANES,
  chickenMultiplier,
  rollCrashLane,
  survivalProb,
  Difficulty,
} from "@/lib/games/chicken";

const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

describe("chickenMultiplier", () => {
  it("is 1.0 before crossing any lane", () => {
    for (const d of DIFFS) expect(chickenMultiplier(d, 0)).toBe(1);
  });

  it("grows geometrically by 1/p each lane (× 0.99 RTP)", () => {
    for (const d of DIFFS) {
      const p = survivalProb(d);
      expect(chickenMultiplier(d, 1)).toBeCloseTo((1 / p) * 0.99, 5);
      expect(chickenMultiplier(d, 5)).toBeCloseTo(Math.pow(1 / p, 5) * 0.99, 5);
    }
  });

  it("is strictly increasing lane over lane", () => {
    for (const d of DIFFS) {
      for (let n = 1; n <= CHICKEN_LANES; n++) {
        expect(chickenMultiplier(d, n)).toBeGreaterThan(
          chickenMultiplier(d, n - 1)
        );
      }
    }
  });

  it("throws when lanesCrossed is out of range", () => {
    expect(() => chickenMultiplier("easy", -1)).toThrow();
    expect(() => chickenMultiplier("easy", CHICKEN_LANES + 1)).toThrow();
  });
});

describe("rollCrashLane", () => {
  it("returns a lane in [1, CHICKEN_LANES+1]", () => {
    for (let i = 0; i < 2000; i++) {
      const lane = rollCrashLane("medium");
      expect(lane).toBeGreaterThanOrEqual(1);
      expect(lane).toBeLessThanOrEqual(CHICKEN_LANES + 1);
    }
  });

  it("hits sooner on harder difficulties on average", () => {
    const avg = (d: Difficulty) => {
      const n = 5000;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += rollCrashLane(d);
      return sum / n;
    };
    expect(avg("easy")).toBeGreaterThan(avg("medium"));
    expect(avg("medium")).toBeGreaterThan(avg("hard"));
  });
});

describe("RTP via direct simulation", () => {
  it("a fixed cash-at-lane-K strategy returns ~99% regardless of K", () => {
    const trials = 40_000;
    const bet = 100;
    for (const d of DIFFS) {
      for (const K of [1, 3, 5]) {
        let totalReturn = 0;
        for (let i = 0; i < trials; i++) {
          const crashLane = rollCrashLane(d);
          // Survive all K lanes only if the car is further than lane K.
          if (crashLane > K) {
            totalReturn += Math.floor(bet * chickenMultiplier(d, K));
          }
        }
        const rtp = totalReturn / (bet * trials);
        expect(rtp).toBeGreaterThan(0.93);
        expect(rtp).toBeLessThan(1.05);
      }
    }
  });
});
