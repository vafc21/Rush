import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceSupabase } from "@/lib/db/supabase";
import { placeDiceBet } from "@/app/api/games/dice/play/handler";

let lobbyId: string;
let playerId: string;

beforeAll(async () => {
  const supabase = getServiceSupabase();
  const { data: l, error: le } = await supabase
    .from("lobbies")
    .insert({ type: "private", size: 4, duration_seconds: 180, status: "active" })
    .select("id")
    .single();
  if (le) throw new Error("setup lobby insert failed: " + le.message);
  lobbyId = l!.id;
  const { data: p, error: pe } = await supabase
    .from("lobby_players")
    .insert({ lobby_id: lobbyId, nickname: "tester", balance_cents: 10_000 })
    .select("id")
    .single();
  if (pe) throw new Error("setup player insert failed: " + pe.message);
  playerId = p!.id;
});

afterAll(async () => {
  const supabase = getServiceSupabase();
  await supabase.from("lobbies").delete().eq("id", lobbyId);
});

describe("placeDiceBet", () => {
  it("deducts the bet and pays out on win (forced roll)", async () => {
    const result = await placeDiceBet({
      lobbyPlayerId: playerId,
      betCents: 100,
      rollUnder: 50,
      _forcedRoll: 10, // forces a win
    });
    expect(result.won).toBe(true);
    expect(result.newBalanceCents).toBe(10_000 - 100 + Math.floor(100 * 1.98));
  });

  it("rejects insufficient balance atomically", async () => {
    await expect(
      placeDiceBet({
        lobbyPlayerId: playerId,
        betCents: 999_999,
        rollUnder: 50,
      })
    ).rejects.toThrow(/insufficient/i);
  });
});
