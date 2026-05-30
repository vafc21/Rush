"use client";
import { useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";

type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy · 4 tiles",
  medium: "Medium · 3 tiles",
  hard: "Hard · 2 tiles",
};

const DIFFICULTY_TILES: Record<Difficulty, number> = {
  easy: 4,
  medium: 3,
  hard: 2,
};

const ROWS = 9;

type Game = {
  betId: string;
  betCents: number;
  difficulty: Difficulty;
  tilesPerRow: number;
  climbed: number[];
  multiplier: number;
  status: "playing" | "burned" | "cashed";
  dragons?: number[];
};

export function DragonTowerGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
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
    const res = await fetch("/api/games/dragon-tower/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, difficulty }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "start failed");
      return;
    }
    const data = (await res.json()) as {
      betId: string;
      difficulty: Difficulty;
      tilesPerRow: number;
    };
    setGame({
      betId: data.betId,
      betCents,
      difficulty: data.difficulty,
      tilesPerRow: data.tilesPerRow,
      climbed: [],
      multiplier: 1,
      status: "playing",
    });
  }

  async function climb(tileIndex: number) {
    if (!game || game.status !== "playing" || busy) return;
    setBusy(true);
    const res = await fetch("/api/games/dragon-tower/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId, tileIndex }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "climb failed");
      return;
    }
    const data = (await res.json()) as {
      burned: boolean;
      rowsClimbed: number;
      multiplier: number;
      dragons?: number[];
    };
    setGame((g) => {
      if (!g) return g;
      if (data.burned) {
        return {
          ...g,
          status: "burned",
          dragons: data.dragons,
          // Keep climbed array as it was for visual
        };
      }
      return {
        ...g,
        climbed: [...g.climbed, tileIndex],
        multiplier: data.multiplier,
      };
    });
  }

  async function cashout() {
    if (!game || game.status !== "playing" || game.climbed.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/games/dragon-tower/cashout", {
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
    const data = (await res.json()) as {
      payoutCents: number;
      multiplier: number;
      dragons: number[];
    };
    setLastPayout(data.payoutCents);
    setGame((g) =>
      g ? { ...g, status: "cashed", dragons: data.dragons } : g
    );
  }

  function reset() {
    setGame(null);
    setError(null);
    setLastPayout(null);
  }

  const tilesPerRow = game?.tilesPerRow ?? DIFFICULTY_TILES[difficulty];
  const currentRow = game?.climbed.length ?? 0;
  const potentialPayout = game
    ? Math.floor(game.betCents * game.multiplier)
    : 0;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🐉 Dragon Tower</h2>
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

      {/* Tower — render rows top-down so row 8 is on top */}
      <div className="flex flex-col-reverse gap-1.5">
        {Array.from({ length: ROWS }, (_, row) => {
          const isCurrentRow = game?.status === "playing" && row === currentRow;
          const isClimbed = game && row < game.climbed.length;
          const isFuture = game && row > currentRow;
          const gameOver = game?.status === "burned" || game?.status === "cashed";
          return (
            <div key={row} className="flex gap-1.5">
              {Array.from({ length: tilesPerRow }, (_, col) => {
                const climbedTile = isClimbed ? game!.climbed[row] : undefined;
                const dragonHere =
                  gameOver && game?.dragons && game.dragons[row] === col;
                const climbedHere = isClimbed && climbedTile === col;
                let cls =
                  "bg-bg/40 text-bg/40 pointer-events-none";
                let label = "";
                if (isClimbed) {
                  if (climbedHere) {
                    cls = "bg-accent/30 text-accent";
                    label = "🥚";
                  } else if (dragonHere) {
                    cls = "bg-red-500/20 text-red-300";
                    label = "🐉";
                  } else {
                    cls = "bg-bg/30 text-muted/40";
                  }
                } else if (isCurrentRow) {
                  cls =
                    "bg-bg text-white cursor-pointer hover:bg-accent/20 hover:scale-[1.03] transition-all active:scale-95";
                } else if (gameOver) {
                  if (dragonHere) {
                    cls = "bg-red-500/30 text-red-300";
                    label = "🐉";
                  } else {
                    cls = "bg-bg/30 text-muted/40";
                  }
                } else if (isFuture) {
                  cls = "bg-bg/40 cursor-default";
                }
                return (
                  <button
                    key={col}
                    disabled={!isCurrentRow || busy}
                    onClick={() => climb(col)}
                    className={`flex-1 h-10 rounded-md text-lg font-bold ${cls}`}
                    style={
                      isClimbed || (gameOver && dragonHere)
                        ? { animation: "rush-pop 250ms ease-out" }
                        : undefined
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Pre-game controls */}
      {!game && (
        <>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted">
              Difficulty
            </p>
            <div className="flex gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
                    difficulty === d
                      ? "bg-accent text-bg"
                      : "bg-bg text-secondary hover:bg-bg/70"
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted">Bet</p>
              <p className="text-[10px] text-muted">
                Max{" "}
                <span className="tabular-nums text-secondary">
                  ${(MAX_BET_CENTS / 100).toFixed(0)}
                </span>
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
            {busy ? "Starting…" : "Start Climb"}
          </Button>
        </>
      )}

      {/* Cash Out */}
      {game?.status === "playing" && (
        <Button
          onClick={cashout}
          disabled={busy || game.climbed.length === 0}
          className="w-full"
        >
          {game.climbed.length === 0
            ? "Pick a tile to start"
            : `Cash Out $${(potentialPayout / 100).toFixed(2)}`}
        </Button>
      )}

      {/* Result */}
      {game?.status === "burned" && (
        <div className="space-y-2 rounded-md bg-red-500/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-red-300">🐉 Burned</p>
          <p className="text-sm text-red-300">
            Lost ${(game.betCents / 100).toFixed(2)} on row {currentRow + 1}
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
            Climbed {game.climbed.length} rows at {game.multiplier.toFixed(2)}x
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
