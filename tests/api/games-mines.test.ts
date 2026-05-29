import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getServiceSupabase } from "@/lib/db/supabase";
import {
  startMinesGame,
  revealMinesTile,
  cashoutMinesGame,
} from "@/app/api/games/mines/handler";
import { minesMultiplier } from "@/lib/games/mines";

let lobbyId: string;
let playerId: string;

beforeAll(async () => {
  const supabase = getServiceSupabase();
  const { data: l } = await supabase
    .from("lobbies")
    .insert({ type: "private", size: 4, duration_seconds: 180, status: "active" })
    .select("id")
    .single();
  lobbyId = l!.id;
  const { data: p } = await supabase
    .from("lobby_players")
    .insert({ lobby_id: lobbyId, nickname: "minestester", balance_cents: 20_000 })
    .select("id")
    .single();
  playerId = p!.id;
});

afterAll(async () => {
  const supabase = getServiceSupabase();
  await supabase.from("lobbies").delete().eq("id", lobbyId);
});

describe("Mines game flow", () => {
  it("start → 3 safe reveals → cashout pays the expected multiplier", async () => {
    // Force mines at tiles 0, 1, 2 so we know tiles 3..24 are safe.
    const started = await startMinesGame({
      lobbyPlayerId: playerId,
      betCents: 100,
      minesCount: 3,
      _forcedMines: [0, 1, 2],
    });
    expect(started.minesCount).toBe(3);

    const r1 = await revealMinesTile({
      lobbyPlayerId: playerId,
      betId: started.betId,
      tileIndex: 10,
    });
    expect(r1.exploded).toBe(false);
    expect(r1.revealed).toEqual([10]);
    expect(r1.multiplier).toBeCloseTo(minesMultiplier(3, 1), 3);

    const r2 = await revealMinesTile({
      lobbyPlayerId: playerId,
      betId: started.betId,
      tileIndex: 15,
    });
    expect(r2.exploded).toBe(false);
    expect(r2.revealed).toEqual([10, 15]);

    const r3 = await revealMinesTile({
      lobbyPlayerId: playerId,
      betId: started.betId,
      tileIndex: 20,
    });
    expect(r3.exploded).toBe(false);
    expect(r3.revealed).toEqual([10, 15, 20]);

    const cashout = await cashoutMinesGame({
      lobbyPlayerId: playerId,
      betId: started.betId,
    });
    expect(cashout.multiplier).toBeCloseTo(minesMultiplier(3, 3), 3);
    expect(cashout.payoutCents).toBe(
      Math.floor(100 * minesMultiplier(3, 3))
    );
  });

  it("clicking a mine explodes the game and returns mine positions", async () => {
    const started = await startMinesGame({
      lobbyPlayerId: playerId,
      betCents: 100,
      minesCount: 5,
      _forcedMines: [0, 5, 10, 15, 20],
    });
    // Tile 0 is a mine
    const r = await revealMinesTile({
      lobbyPlayerId: playerId,
      betId: started.betId,
      tileIndex: 0,
    });
    expect(r.exploded).toBe(true);
    expect(r.multiplier).toBe(0);
    expect(r.minePositions).toEqual([0, 5, 10, 15, 20]);
  });

  it("rejects revealing an already-revealed tile", async () => {
    const started = await startMinesGame({
      lobbyPlayerId: playerId,
      betCents: 100,
      minesCount: 3,
      _forcedMines: [0, 1, 2],
    });
    await revealMinesTile({
      lobbyPlayerId: playerId,
      betId: started.betId,
      tileIndex: 5,
    });
    await expect(
      revealMinesTile({
        lobbyPlayerId: playerId,
        betId: started.betId,
        tileIndex: 5,
      })
    ).rejects.toThrow(/already/);
  });

  it("rejects cashout with no tiles revealed", async () => {
    const started = await startMinesGame({
      lobbyPlayerId: playerId,
      betCents: 100,
      minesCount: 3,
      _forcedMines: [0, 1, 2],
    });
    await expect(
      cashoutMinesGame({ lobbyPlayerId: playerId, betId: started.betId })
    ).rejects.toThrow(/nothing/);
  });

  it("rejects cashout after explosion", async () => {
    const started = await startMinesGame({
      lobbyPlayerId: playerId,
      betCents: 100,
      minesCount: 3,
      _forcedMines: [0, 1, 2],
    });
    await revealMinesTile({
      lobbyPlayerId: playerId,
      betId: started.betId,
      tileIndex: 0,
    });
    await expect(
      cashoutMinesGame({ lobbyPlayerId: playerId, betId: started.betId })
    ).rejects.toThrow(/not active/);
  });
});
