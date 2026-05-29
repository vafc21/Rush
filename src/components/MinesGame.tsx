"use client";
import { useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { MIN_MINES, MAX_MINES, MINES_TILES } from "@/lib/games/mines";

type TileState = "hidden" | "safe" | "mine";

type Game = {
  betId: string;
  betCents: number;
  minesCount: number;
  revealed: Set<number>;
  multiplier: number;
  status: "playing" | "exploded" | "cashed";
  minePositions?: number[];
};

export function MinesGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [minesCount, setMinesCount] = useState(3);
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPayout, setLastPayout] = useState<number | null>(null);

  async function start() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is $${(MAX_BET_CENTS / 100).toFixed(0)} per game`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    setLastPayout(null);

    const res = await fetch("/api/games/mines/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, minesCount }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "could not start");
      return;
    }
    const data = (await res.json()) as {
      betId: string;
      minesCount: number;
      multiplierAtFirstClick: number;
    };
    setGame({
      betId: data.betId,
      betCents,
      minesCount: data.minesCount,
      revealed: new Set(),
      multiplier: 1, // no winnings until first click
      status: "playing",
    });
  }

  async function reveal(tileIndex: number) {
    if (!game || game.status !== "playing" || busy) return;
    if (game.revealed.has(tileIndex)) return;
    setBusy(true);

    const res = await fetch("/api/games/mines/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId, tileIndex }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "reveal failed");
      return;
    }
    const result = (await res.json()) as {
      exploded: boolean;
      revealed: number[];
      multiplier: number;
      minePositions?: number[];
    };
    setGame((g) => {
      if (!g) return g;
      return {
        ...g,
        revealed: new Set(result.revealed),
        multiplier: result.multiplier,
        status: result.exploded ? "exploded" : "playing",
        minePositions: result.minePositions,
      };
    });
  }

  async function cashout() {
    if (!game || game.status !== "playing" || game.revealed.size === 0 || busy) {
      return;
    }
    setBusy(true);
    const res = await fetch("/api/games/mines/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "cashout failed");
      return;
    }
    const data = (await res.json()) as { payoutCents: number; multiplier: number };
    setLastPayout(data.payoutCents);
    setGame((g) => (g ? { ...g, status: "cashed" } : g));
  }

  function reset() {
    setGame(null);
    setError(null);
    setLastPayout(null);
  }

  const tiles: TileState[] = Array.from({ length: MINES_TILES }, (_, i) => {
    if (!game) return "hidden";
    if (game.revealed.has(i)) return "safe";
    if (game.minePositions?.includes(i)) return "mine";
    return "hidden";
  });

  const potentialPayout = game
    ? Math.floor(game.betCents * game.multiplier)
    : 0;

  return (
    <div className="w-full max-w-md space-y-5 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">💣 Mines</h2>
        {game && (
          <div className="text-xs text-muted">
            Multi{" "}
            <span className="font-bold tabular-nums text-accent">
              {game.multiplier.toFixed(2)}x
            </span>{" "}
            ·{" "}
            <span className="tabular-nums text-white">
              ${(potentialPayout / 100).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* 5x5 grid */}
      <div className="grid grid-cols-5 gap-2">
        {tiles.map((state, i) => (
          <button
            key={i}
            disabled={!game || game.status !== "playing" || state !== "hidden"}
            onClick={() => reveal(i)}
            className={`aspect-square rounded-md text-2xl font-bold transition-all duration-200 active:scale-95 ${
              state === "hidden"
                ? game?.status === "exploded" || game?.status === "cashed"
                  ? "bg-bg/40 cursor-default"
                  : "bg-bg hover:bg-accent/20 hover:scale-[1.03] cursor-pointer"
                : state === "safe"
                  ? "bg-accent/20 text-accent"
                  : "bg-red-500/30 text-red-300"
            }`}
            style={
              state !== "hidden"
                ? {
                    animation: "rush-pop 250ms ease-out",
                  }
                : undefined
            }
          >
            {state === "safe" ? "✓" : state === "mine" ? "💣" : ""}
          </button>
        ))}
      </div>

      {/* Pre-game controls */}
      {!game && (
        <>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted">Mines</p>
              <p className="text-sm font-semibold tabular-nums text-white">
                {minesCount} / {MAX_MINES}
              </p>
            </div>
            <input
              type="range"
              min={MIN_MINES}
              max={MAX_MINES}
              value={minesCount}
              onChange={(e) => setMinesCount(parseInt(e.target.value))}
              disabled={busy}
              className="w-full accent-accent"
            />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted">Bet</p>
              <p className="text-[10px] text-muted">
                Max{" "}
                <span className="tabular-nums text-secondary">
                  ${(MAX_BET_CENTS / 100).toFixed(0)}
                </span>{" "}
                / game
              </p>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
                type="number"
                min={MIN_BET_CENTS / 100}
                max={MAX_BET_CENTS / 100}
                step="0.50"
                value={betDollars}
                disabled={busy}
                onChange={(e) => setBetDollars(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setBetDollars(
                    Math.max(
                      MIN_BET_CENTS / 100,
                      parseFloat(betDollars || "1") / 2
                    ).toFixed(2)
                  )
                }
                className="rounded-md bg-bg px-3 text-xs font-semibold text-secondary transition hover:bg-bg/70 active:scale-95 disabled:opacity-50"
              >
                ½
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setBetDollars(
                    Math.min(
                      MAX_BET_CENTS / 100,
                      Math.min(balanceCents, MAX_BET_CENTS) / 100,
                      parseFloat(betDollars || "1") * 2
                    ).toFixed(2)
                  )
                }
                className="rounded-md bg-bg px-3 text-xs font-semibold text-secondary transition hover:bg-bg/70 active:scale-95 disabled:opacity-50"
              >
                2×
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setBetDollars(
                    (Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2)
                  )
                }
                className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand transition hover:bg-brand/25 active:scale-95 disabled:opacity-50"
              >
                Max
              </button>
            </div>
          </div>

          <Button onClick={start} disabled={busy} className="w-full">
            {busy ? "Starting…" : "Start Game"}
          </Button>
        </>
      )}

      {/* In-game controls */}
      {game && game.status === "playing" && (
        <Button
          onClick={cashout}
          disabled={busy || game.revealed.size === 0}
          className="w-full"
        >
          {game.revealed.size === 0
            ? "Click a tile to start"
            : `Cash Out $${(potentialPayout / 100).toFixed(2)}`}
        </Button>
      )}

      {/* Result panel */}
      {game?.status === "exploded" && (
        <div className="space-y-2 rounded-md bg-red-500/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-red-300">BOOM</p>
          <p className="text-sm text-red-300">
            Lost ${(game.betCents / 100).toFixed(2)}
          </p>
          <button
            onClick={reset}
            className="text-xs font-semibold text-muted underline hover:text-white"
          >
            Play again
          </button>
        </div>
      )}
      {game?.status === "cashed" && lastPayout !== null && (
        <div className="space-y-2 rounded-md bg-accent/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-accent">
            +${(lastPayout / 100).toFixed(2)}
          </p>
          <p className="text-sm text-accent/80">
            Cashed at {game.multiplier.toFixed(2)}x
          </p>
          <button
            onClick={reset}
            className="text-xs font-semibold text-muted underline hover:text-white"
          >
            Play again
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
