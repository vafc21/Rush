import { describe, it, expect } from "vitest";
import { generateNickname, isPlausibleNickname } from "@/lib/lobby/nicknames";

describe("generateNickname", () => {
  it("produces a string of allowed length", () => {
    for (let i = 0; i < 100; i++) {
      const n = generateNickname();
      expect(n).toMatch(/^[a-z0-9_]+$/);
      expect(n.length).toBeGreaterThanOrEqual(3);
      expect(n.length).toBeLessThanOrEqual(20);
    }
  });

  it("produces varied output", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateNickname());
    expect(seen.size).toBeGreaterThan(50);
  });
});

describe("isPlausibleNickname", () => {
  it("accepts valid names", () => {
    expect(isPlausibleNickname("moondancer")).toBe(true);
    expect(isPlausibleNickname("v0rtex_")).toBe(true);
    expect(isPlausibleNickname("abc")).toBe(true);
  });

  it("rejects too short / too long / bad chars", () => {
    expect(isPlausibleNickname("ab")).toBe(false);
    expect(isPlausibleNickname("a".repeat(25))).toBe(false);
    expect(isPlausibleNickname("has space")).toBe(false);
    expect(isPlausibleNickname("UPPER")).toBe(false);
  });
});
