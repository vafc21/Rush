import { describe, it, expect } from "vitest";
import {
  DIFFICULTIES,
  DIFFICULTY_TABLES,
  Difficulty,
  expectedValue,
  openCrate,
  crateOutcome,
  tableFor,
} from "@/lib/games/crateRun";

// Intended return-to-player bands per difficulty (EV = sum(p * multiplier)).
//   easy   ~0.95  (~5% house edge)
//   normal ~0.92  (~8% house edge)
//   hard   ~0.82  (~18% house edge)
const EV_BANDS: Record<Difficulty, [min: number, max: number]> = {
  easy: [0.94, 0.96],
  normal: [0.9, 0.93],
  hard: [0.8, 0.84],
};

describe("difficulty tables", () => {
  it("each difficulty's probabilities sum to 1", () => {
    for (const d of DIFFICULTIES) {
      const sum = DIFFICULTY_TABLES[d].reduce((s, t) => s + t.probability, 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it("each difficulty's EV falls inside its intended house-edge band", () => {
    for (const d of DIFFICULTIES) {
      const ev = expectedValue(d);
      const [min, max] = EV_BANDS[d];
      expect(ev).toBeGreaterThanOrEqual(min);
      expect(ev).toBeLessThanOrEqual(max);
      // Every difficulty must keep a house edge (EV < 1).
      expect(ev).toBeLessThan(1);
    }
  });

  it("uses the same eight ascending rarity tiers everywhere", () => {
    const tiers = [
      "gray",
      "white",
      "light_blue",
      "blue",
      "purple",
      "pink",
      "red",
      "gold",
    ];
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY_TABLES[d].map((t) => t.tier)).toEqual(tiers);
    }
  });

  it("matches the published jackpot odds per difficulty", () => {
    const gold = (d: Difficulty) =>
      tableFor(d).find((t) => t.tier === "gold")!;
    expect(gold("easy").multiplier).toBe(200);
    expect(1 / gold("easy").probability).toBeCloseTo(2000, 0); // ~1 in 2,000
    expect(gold("normal").multiplier).toBe(500);
    expect(gold("hard").multiplier).toBe(2000);
    expect(1 / gold("hard").probability).toBeCloseTo(12500, 0); // ~1 in 12,500
  });
});

describe("openCrate", () => {
  it("respects forced rolls at the table boundaries", () => {
    // roll 0 always lands on the first (gray) tier.
    expect(openCrate("normal", 0).tier).toBe("gray");
    // a roll just inside the top of the range lands on the rarest tier.
    expect(openCrate("normal", 9_999_999).tier).toBe("gold");
  });

  it("always returns a tier from the difficulty's table", () => {
    for (const d of DIFFICULTIES) {
      const valid = new Set(tableFor(d).map((t) => t.tier));
      for (let i = 0; i < 2000; i++) {
        expect(valid.has(openCrate(d).tier)).toBe(true);
      }
    }
  });

  it("samples tiers at roughly their published frequency", () => {
    const N = 200_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const t = openCrate("normal").tier;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const t of tableFor("normal")) {
      if (t.probability < 0.01) continue; // rare tiers are too noisy at this N
      expect(counts[t.tier] / N).toBeCloseTo(t.probability, 1);
    }
  });
});

describe("crateOutcome payout math", () => {
  it("pays floor(bet * multiplier) for the rolled tier", () => {
    // forced roll 0 => gray. Normal gray is 0.2x.
    const r = crateOutcome({ difficulty: "normal", betCents: 1000, forcedRoll: 0 });
    expect(r.tier).toBe("gray");
    expect(r.multiplier).toBe(0.2);
    expect(r.payoutCents).toBe(200);
  });

  it("pays the jackpot multiplier on a forced gold roll", () => {
    const r = crateOutcome({
      difficulty: "hard",
      betCents: 100,
      forcedRoll: 9_999_999,
    });
    expect(r.tier).toBe("gold");
    expect(r.payoutCents).toBe(100 * 2000);
  });

  it("floors fractional cents rather than over-paying", () => {
    // 333 * 0.5 = 166.5 -> floored to 166.
    const r = crateOutcome({ difficulty: "easy", betCents: 333, forcedRoll: 0 });
    expect(r.multiplier).toBe(0.5);
    expect(r.payoutCents).toBe(166);
  });

  it("delivers each difficulty's EV across a large simulation", () => {
    const bet = 100;
    const N = 300_000;
    for (const d of DIFFICULTIES) {
      let total = 0;
      for (let i = 0; i < N; i++) {
        total += crateOutcome({ difficulty: d, betCents: bet }).payoutCents;
      }
      const rtp = total / (bet * N);
      const [min, max] = EV_BANDS[d];
      // Simulated RTP should land near the analytic EV band (loose tail noise).
      expect(rtp).toBeGreaterThan(min - 0.05);
      expect(rtp).toBeLessThan(max + 0.05);
    }
  });
});
