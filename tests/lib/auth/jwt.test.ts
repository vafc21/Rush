import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession, SessionPayload } from "@/lib/auth/jwt";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-test-secret";
});

describe("jwt", () => {
  it("round-trips a guest session", async () => {
    const payload: SessionPayload = {
      kind: "guest",
      guestId: "00000000-0000-0000-0000-000000000001",
      nickname: "moondancer",
    };
    const token = await signSession(payload);
    const verified = await verifySession(token);
    expect(verified).toEqual(payload);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({
      kind: "guest",
      guestId: "00000000-0000-0000-0000-000000000001",
      nickname: "moondancer",
    });
    const tampered = token.slice(0, -2) + "xx";
    await expect(verifySession(tampered)).rejects.toThrow();
  });
});
