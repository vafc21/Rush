"use client";
import { useRef, useState } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { MIN_MINES, MAX_MINES, MINES_TILES } from "@/lib/games/mines";
import { pts } from "@/lib/format";

/**
 * Visual state per tile:
 *  - hidden:               still clickable (active game)
 *  - safe-clicked:         player revealed it during play (bright green ✓)
 *  - safe-missed:          un-clicked but safe — shown dim after the game ends
 *  - mine:                 a mine — shown red after the game ends
 *  - locked:               game over, this tile was unrevealed (used during
 *                          a brief intermediate state; rarely hit in practice)
 *
 * Auto mode: between rounds, clicks toggle a "pre-selected" marker on tiles
 * (yellow ring). The AutoBet loop then starts a round, reveals each
 * pre-selected tile in sequence, and cashes out if they're all safe.
 */
type TileState = "hidden" | "safe-clicked" | "safe-missed" | "mine" | "locked";
type Mode = "manual" | "auto";

type StartResponse = {
  betId: string;
  minesCount: number;
  multiplierAtFirstClick: number;
};
type RevealResponse = {
  exploded: boolean;
  revealed: number[];
  multiplier: number;
  minePositions?: number[];
};
type CashoutResponse = {
  payoutCents: number;
  multiplier: number;
  minePositions: number[];
};

type Game = {
  betId: string;
  betCents: number;
  minesCount: number;
  revealed: Set<number>;
  multiplier: number;
  status: "playing" | "exploded" | "cashed";
  minePositions?: number[];
};

const REVEAL_DELAY_MS = 130;
const ROUND_END_DELAY_MS = 700;

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
  const [mode, setMode] = useState<Mode>("manual");
  const [preselected, setPreselected] = useState<Set<number>>(new Set());
  // Track whether the auto loop is the source of the in-flight bet so
  // we don't show the "busy" gate on manual buttons during auto runs.
  const autoActiveRef = useRef(false);

  // ── Pure API helpers (no state, callable from anywhere) ──
  async function apiStart(betCents: number): Promise<StartResponse | { error: string }> {
    const res = await fetch("/api/games/mines/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, minesCount }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.error ?? "could not start" };
    }
    return (await res.json()) as StartResponse;
  }

  async function apiReveal(betId: string, tileIndex: number): Promise<RevealResponse | { error: string }> {
    const res = await fetch("/api/games/mines/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId, tileIndex }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.error ?? "reveal failed" };
    }
    return (await res.json()) as RevealResponse;
  }

  async function apiCashout(betId: string): Promise<CashoutResponse | { error: string }> {
    const res = await fetch("/api/games/mines/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.error ?? "cashout failed" };
    }
    return (await res.json()) as CashoutResponse;
  }

  function validateBet(): { ok: true; betCents: number } | { ok: false; error: string } {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      return { ok: false, error: `Minimum bet is ${pts(MIN_BET_CENTS)} pts` };
    }
    if (betCents > MAX_BET_CENTS) {
      return { ok: false, error: `Max bet is ${pts(MAX_BET_CENTS)} pts per game` };
    }
    if (betCents > balanceCents) {
      return { ok: false, error: "Insufficient balance" };
    }
    return { ok: true, betCents };
  }

  // ── Manual play handlers ──
  async function start() {
    const v = validateBet();
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    setError(null);
    setLastPayout(null);
    const data = await apiStart(v.betCents);
    setBusy(false);
    if ("error" in data) {
      setError(data.error);
      return;
    }
    setGame({
      betId: data.betId,
      betCents: v.betCents,
      minesCount: data.minesCount,
      revealed: new Set(),
      multiplier: 1,
      status: "playing",
    });
  }

  async function reveal(tileIndex: number) {
    if (!game || game.status !== "playing" || busy) return;
    if (game.revealed.has(tileIndex)) return;
    setBusy(true);
    const result = await apiReveal(game.betId, tileIndex);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setGame((g) =>
      g
        ? {
            ...g,
            revealed: new Set(result.revealed),
            multiplier: result.multiplier,
            status: result.exploded ? "exploded" : "playing",
            minePositions: result.minePositions,
          }
        : g
    );
  }

  async function cashout() {
    if (!game || game.status !== "playing" || game.revealed.size === 0 || busy) {
      return;
    }
    setBusy(true);
    const data = await apiCashout(game.betId);
    setBusy(false);
    if ("error" in data) {
      setError(data.error);
      return;
    }
    setLastPayout(data.payoutCents);
    setGame((g) =>
      g
        ? { ...g, status: "cashed", minePositions: data.minePositions }
        : g
    );
  }

  function reset() {
    setGame(null);
    setError(null);
    setLastPayout(null);
  }

  // ── Auto-bet orchestrator (one full round) ──
  async function autoRound(): Promise<boolean> {
    if (preselected.size === 0) {
      setError("Pick tiles to reveal first (Auto mode)");
      return false;
    }
    if (preselected.size + minesCount > MINES_TILES) {
      setError("Too many pre-selected tiles — would leave no safe path");
      return false;
    }
    const v = validateBet();
    if (!v.ok) {
      setError(v.error);
      return false;
    }
    autoActiveRef.current = true;
    setError(null);
    setLastPayout(null);
    // Start
    const startData = await apiStart(v.betCents);
    if ("error" in startData) {
      setError(startData.error);
      autoActiveRef.current = false;
      return false;
    }
    const liveGame: Game = {
      betId: startData.betId,
      betCents: v.betCents,
      minesCount: startData.minesCount,
      revealed: new Set(),
      multiplier: 1,
      status: "playing",
    };
    setGame(liveGame);

    // Reveal each preselected tile in sequence
    const tiles = [...preselected];
    let exploded = false;
    let finalMinePositions: number[] | undefined;
    for (const i of tiles) {
      await new Promise((r) => setTimeout(r, REVEAL_DELAY_MS));
      const result = await apiReveal(liveGame.betId, i);
      if ("error" in result) {
        setError(result.error);
        autoActiveRef.current = false;
        return false;
      }
      liveGame.revealed = new Set(result.revealed);
      liveGame.multiplier = result.multiplier;
      liveGame.status = result.exploded ? "exploded" : "playing";
      if (result.minePositions) finalMinePositions = result.minePositions;
      setGame({ ...liveGame });
      if (result.exploded) {
        exploded = true;
        break;
      }
    }

    if (!exploded) {
      // Cashout
      const co = await apiCashout(liveGame.betId);
      if ("error" in co) {
        setError(co.error);
        autoActiveRef.current = false;
        return false;
      }
      setLastPayout(co.payoutCents);
      setGame({
        ...liveGame,
        status: "cashed",
        minePositions: co.minePositions,
      });
    } else if (finalMinePositions) {
      setGame({ ...liveGame, minePositions: finalMinePositions });
    }

    // Brief pause so the user can see the outcome, then clear for next round
    await new Promise((r) => setTimeout(r, ROUND_END_DELAY_MS));
    setGame(null);
    setLastPayout(null);
    autoActiveRef.current = false;
    return true;
  }

  const gameOver = game?.status === "exploded" || game?.status === "cashed";
  const tiles: TileState[] = Array.from({ length: MINES_TILES }, (_, i) => {
    if (!game) return "hidden";
    if (game.revealed.has(i)) return "safe-clicked";
    if (game.minePositions?.includes(i)) return "mine";
    if (gameOver) return "safe-missed";
    return "hidden";
  });

  const potentialPayout = game
    ? Math.floor(game.betCents * game.multiplier)
    : 0;

  const onTileClick = (i: number) => {
    if (mode === "auto" && !game) {
      // Pre-select / un-preselect for the auto loop
      setPreselected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
      return;
    }
    reveal(i);
  };

  return (
    <div className="w-full max-w-md space-y-5 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">💣 Mines</h2>
        <div className="flex items-center gap-3">
          {game && (
            <div className="text-xs text-muted">
              Multi{" "}
              <span className="font-bold tabular-nums text-accent">
                {game.multiplier.toFixed(2)}x
              </span>{" "}
              ·{" "}
              <span className="tabular-nums text-white">
                {pts(potentialPayout)} pts
              </span>
            </div>
          )}
          {/* Mode toggle */}
          <div className="flex rounded-md bg-bg p-0.5 text-[10px] font-bold">
            <button
              onClick={() => setMode("manual")}
              disabled={!!game}
              className={`rounded px-2 py-1 transition ${
                mode === "manual" ? "bg-accent text-bg" : "text-muted hover:text-white"
              } disabled:opacity-40`}
            >
              MANUAL
            </button>
            <button
              onClick={() => setMode("auto")}
              disabled={!!game}
              className={`rounded px-2 py-1 transition ${
                mode === "auto" ? "bg-accent text-bg" : "text-muted hover:text-white"
              } disabled:opacity-40`}
            >
              AUTO
            </button>
          </div>
        </div>
      </div>

      {/* 5x5 grid */}
      <div className="grid grid-cols-5 gap-2">
        {tiles.map((state, i) => {
          const isPreselected = mode === "auto" && !game && preselected.has(i);
          const isClickable =
            // Manual play: reveal tiles during a live game
            (mode === "manual" && state === "hidden" && game?.status === "playing") ||
            // Auto setup: toggle pre-selections before a round starts.
            // (During an auto round the loop drives reveals — no clicks.)
            (mode === "auto" && !game);
          const classes =
            state === "hidden"
              ? isClickable
                ? "bg-bg hover:bg-accent/20 hover:scale-[1.03] cursor-pointer"
                : "bg-bg/40 cursor-default"
              : state === "safe-clicked"
                ? "bg-accent/20 text-accent"
                : state === "safe-missed"
                  ? "bg-bg/30 text-muted/70"
                  : state === "mine"
                    ? "bg-red-500/30 text-red-300"
                    : "bg-bg/30";
          return (
            <button
              key={i}
              disabled={!isClickable}
              onClick={() => onTileClick(i)}
              className={`relative aspect-square rounded-md text-2xl font-bold transition-all duration-200 active:scale-95 ${classes} ${
                isPreselected ? "ring-2 ring-brand" : ""
              }`}
              style={
                state !== "hidden"
                  ? { animation: "rush-pop 250ms ease-out" }
                  : undefined
              }
            >
              {state === "safe-clicked"
                ? "✓"
                : state === "safe-missed"
                  ? "✓"
                  : state === "mine"
                    ? "💣"
                    : isPreselected
                      ? "•"
                      : ""}
            </button>
          );
        })}
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
                  {pts(MAX_BET_CENTS)} pts
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

          {mode === "manual" ? (
            <Button onClick={start} disabled={busy} className="w-full">
              {busy ? "Starting…" : "Start Game"}
            </Button>
          ) : (
            <p className="text-center text-[11px] text-muted">
              {preselected.size === 0
                ? "Click tiles to pre-select what Auto will reveal each round"
                : `${preselected.size} tile${preselected.size > 1 ? "s" : ""} selected — Auto will cash out if they're all safe`}
            </p>
          )}
        </>
      )}

      {/* Auto-bet driver. Rendered OUTSIDE the {!game && ...} block so it
          stays mounted while a round is in progress — otherwise the loop
          would unmount the moment a game starts and stop after one round. */}
      {mode === "auto" && (
        <AutoBet onPlay={autoRound} pauseMs={400} />
      )}

      {/* In-game manual reveal/cashout — manual mode only (auto handles
          its own cashout). */}
      {mode === "manual" && game && game.status === "playing" && (
        <Button
          onClick={cashout}
          disabled={busy || game.revealed.size === 0}
          className="w-full"
        >
          {game.revealed.size === 0
            ? "Click a tile to start"
            : `Cash Out ${pts(potentialPayout)} pts`}
        </Button>
      )}

      {/* Result panel */}
      {game?.status === "exploded" && (
        <div className="space-y-2 rounded-md bg-red-500/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-red-300">BOOM</p>
          <p className="text-sm text-red-300">
            Lost {pts(game.betCents)} pts
          </p>
          {!autoActiveRef.current && (
            <button
              onClick={reset}
              className="text-xs font-semibold text-muted underline hover:text-white"
            >
              Play again
            </button>
          )}
        </div>
      )}
      {game?.status === "cashed" && lastPayout !== null && (
        <div className="space-y-2 rounded-md bg-accent/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-accent">
            +{pts(lastPayout)} pts
          </p>
          <p className="text-sm text-accent/80">
            Cashed at {game.multiplier.toFixed(2)}x
          </p>
          {!autoActiveRef.current && (
            <button
              onClick={reset}
              className="text-xs font-semibold text-muted underline hover:text-white"
            >
              Play again
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
