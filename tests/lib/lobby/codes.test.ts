import { describe, it, expect } from "vitest";
import { generateLobbyCode, isLobbyCode } from "@/lib/lobby/codes";

describe("generateLobbyCode", () => {
  it("is always 6 alphanumeric uppercase characters", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateLobbyCode();
      expect(c).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("avoids ambiguous characters (0/O, 1/I)", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateLobbyCode();
      expect(c).not.toMatch(/[0OI1]/);
    }
  });
});

describe("isLobbyCode", () => {
  it("normalises and validates", () => {
    expect(isLobbyCode("abc234")).toBe(true);   // lowercase normalises
    expect(isLobbyCode("ABC234")).toBe(true);
    expect(isLobbyCode("ABC2340")).toBe(false); // contains 0
    expect(isLobbyCode("XX")).toBe(false);      // too short
  });
});
