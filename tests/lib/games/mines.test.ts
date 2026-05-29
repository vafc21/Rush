import { describe, it, expect } from "vitest";
import {
  placeMines,
  minesMultiplier,
  MINES_TILES,
  MIN_MINES,
  MAX_MINES,
} from "@/lib/games/mines";

describe("placeMines", () => {
  it("returns the requested number of distinct tile indices in [0, MINES_TILES)", () => {
    for (let m = MIN_MINES; m <= MAX_MINES; m++) {
      const positions = placeMines(m);
      expect(positions).toHaveLength(m);
      const set = new Set(positions);
      expect(set.size).toBe(m);
      for (const p of positions) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(MINES_TILES);
      }
    }
  });

  it("produces well-spread random layouts", () => {
    const counts = new Array<number>(MINES_TILES).fill(0);
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      for (const idx of placeMines(5)) counts[idx]++;
    }
    // each tile should be picked roughly trials * 5 / 25 = 1000 times.
    // allow ±35% variance for sample noise.
    for (const c of counts) {
      expect(c).toBeGreaterThan(trials * 5 / 25 * 0.65);
      expect(c).toBeLessThan(trials * 5 / 25 * 1.35);
    }
  });

  it("throws on out-of-range mine counts", () => {
    expect(() => placeMines(0)).toThrow();
    expect(() => placeMines(25)).toThrow();
    expect(() => placeMines(-1)).toThrow();
  });
});

describe("minesMultiplier", () => {
  it("is 1.0 (no cashout effect) before any tiles are revealed", () => {
    expect(minesMultiplier(3, 0)).toBe(1);
    expect(minesMultiplier(24, 0)).toBe(1);
  });

  it("matches the Stake formula at the canonical (3 mines, 5 clicks) check", () => {
    // Pure geometric product × 0.99 RTP:
    //   (25/22)(24/21)(23/20)(22/19)(21/18) × 0.99 ≈ 1.997...
    // matches the spec's "~2.0x at cashout" example.
    expect(minesMultiplier(3, 5)).toBeCloseTo(1.997, 2);
  });

  it("matches expected values across spot checks", () => {
    expect(minesMultiplier(1, 1)).toBeCloseTo((25 / 24) * 0.99, 3);
    expect(minesMultiplier(24, 1)).toBeCloseTo((25 / 1) * 0.99, 2);
    expect(minesMultiplier(10, 3)).toBeCloseTo(
      (25 / 15) * (24 / 14) * (23 / 13) * 0.99,
      3
    );
  });

  it("throws when clicks exceed safe tiles", () => {
    // M=3 mines → only 22 safe tiles; clicking the 23rd is impossible
    expect(() => minesMultiplier(3, 23)).toThrow();
  });

  it("throws for out-of-range mines counts", () => {
    expect(() => minesMultiplier(MIN_MINES - 1, 1)).toThrow();
    expect(() => minesMultiplier(MAX_MINES + 1, 1)).toThrow();
  });
});

describe("RTP via direct simulation", () => {
  it("over many random plays of 3 mines + cashout-at-5, RTP stays around 99%", () => {
    // For each trial: place mines (3), pick 5 random "click" indices from
    // the 22 safe tiles, cash out at the 5-click multiplier. Compute the
    // long-run return / wager ratio. Because we only count plays that
    // succeeded in revealing 5 safe tiles (i.e. we condition on not
    // hitting a mine), we expect RTP > 1 here; the *unconditional* RTP
    // is 0.99. To validate unconditional, we simulate naive 5-blind-clicks
    // where some hit mines.
    const trials = 20_000;
    const bet = 100;
    let totalReturn = 0;
    for (let i = 0; i < trials; i++) {
      const mines = new Set(placeMines(3));
      const safeIndices = [] as number[];
      for (let t = 0; t < MINES_TILES; t++) if (!mines.has(t)) safeIndices.push(t);
      // Shuffle safeIndices+mines together to pick 5 random tiles:
      const all = Array.from({ length: MINES_TILES }, (_, i) => i);
      for (let j = all.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [all[j], all[k]] = [all[k], all[j]];
      }
      const picks = all.slice(0, 5);
      const hitMine = picks.some((p) => mines.has(p));
      if (hitMine) continue; // lost the bet
      const payout = Math.floor(bet * minesMultiplier(3, 5));
      totalReturn += payout;
    }
    const rtp = totalReturn / (bet * trials);
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(1.02);
  });
});
