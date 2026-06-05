"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { WinBurst } from "./WinBurst";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { pts } from "@/lib/format";
import {
  CHICKEN_LANES,
  chickenMultiplier,
  survivalProb,
  Difficulty,
} from "@/lib/games/chicken";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

type Game = {
  betId: string;
  betCents: number;
  difficulty: Difficulty;
  crossed: number;
  multiplier: number;
  status: "playing" | "squashed" | "cashed";
  crashLane?: number;
};

export function ChickenGame({
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
  // The win/loss panel is only shown once the hop / crash has animated —
  // never the instant the server responds.
  const [revealed, setRevealed] = useState(false);

  const activeRef = useRef<HTMLButtonElement | null>(null);

  const terminal = game?.status === "squashed" || game?.status === "cashed";
  useEffect(() => {
    if (!terminal) {
      setRevealed(false);
      return;
    }
    const delay = game?.status === "squashed" ? 650 : 350;
    const t = setTimeout(() => setRevealed(true), delay);
    return () => clearTimeout(t);
  }, [terminal, game?.status, game?.betId]);

  // Keep the chicken's lane scrolled into view as it crosses the road.
  // `revealed` is a dep so that, after a cash-out, the camera pans to the
  // dodged car once we reveal where the run would have ended.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [game?.crossed, game?.status, revealed]);

  async function start() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is ${pts(MIN_BET_CENTS)} pts`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is ${pts(MAX_BET_CENTS)} pts per game`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    setLastPayout(null);
    const res = await fetch("/api/games/chicken/start", {
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
    const data = (await res.json()) as { betId: string; difficulty: Difficulty };
    setGame({
      betId: data.betId,
      betCents,
      difficulty: data.difficulty,
      crossed: 0,
      multiplier: 1,
      status: "playing",
    });
  }

  async function step() {
    if (!game || game.status !== "playing" || busy) return;
    setBusy(true);
    const res = await fetch("/api/games/chicken/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "step failed");
      return;
    }
    const data = (await res.json()) as {
      squashed: boolean;
      crossed: number;
      multiplier: number;
      crashLane?: number;
    };
    setGame((g) => {
      if (!g) return g;
      if (data.squashed) {
        return { ...g, status: "squashed", crashLane: data.crashLane };
      }
      return { ...g, crossed: data.crossed, multiplier: data.multiplier };
    });
  }

  async function cashout() {
    if (!game || game.status !== "playing" || game.crossed === 0 || busy) return;
    setBusy(true);
    const res = await fetch("/api/games/chicken/cashout", {
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
      crashLane: number;
    };
    setLastPayout(data.payoutCents);
    setGame((g) => (g ? { ...g, status: "cashed", crashLane: data.crashLane } : g));
  }

  function reset() {
    setGame(null);
    setError(null);
    setLastPayout(null);
    setRevealed(false);
  }

  const diff = game?.difficulty ?? difficulty;
  const potentialPayout = game ? Math.floor(game.betCents * game.multiplier) : 0;
  // Lane the camera should center on.
  const focusLane = game
    ? game.status === "squashed"
      ? game.crashLane ?? game.crossed
      : game.status === "playing"
        ? Math.min(game.crossed + 1, CHICKEN_LANES)
        : // cashed — once revealed, pan to the car we dodged (if there was one)
          revealed && game.crashLane && game.crashLane <= CHICKEN_LANES
          ? game.crashLane
          : game.crossed
    : 0;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🐔 Chicken</h2>
        {game?.status === "playing" ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="rounded bg-bg px-2 py-1 text-muted">
              Lane{" "}
              <span className="tabular-nums text-white">{game.crossed}</span>/
              {CHICKEN_LANES}
            </span>
            <span className="rounded bg-accent/15 px-2 py-1 font-bold tabular-nums text-accent">
              {game.multiplier.toFixed(2)}x
            </span>
          </div>
        ) : (
          <div className="text-xs text-muted">Cross the road 🚗</div>
        )}
      </div>

      {/* The road — scrolls sideways as the chicken crosses lane by lane. */}
      <div className="relative">
        <WinBurst
          trigger={revealed && game?.status === "cashed" ? game.betId : false}
          intensity={game && game.multiplier >= 5 ? 1.8 : 1}
        />
        <div className="overflow-hidden rounded-lg ring-1 ring-black/40">
          {/* curb stripes top + bottom */}
          <div className="h-1.5 bg-gradient-to-r from-brand/50 via-brand/10 to-brand/50" />
          <div className="flex overflow-x-auto bg-gradient-to-b from-[#0a141d] via-[#0e1b26] to-[#0a141d] py-3">
            {/* Grass curb — where the chicken starts */}
            <div className="flex h-28 w-12 shrink-0 flex-col items-center justify-center bg-gradient-to-b from-emerald-900/60 to-emerald-950/60">
              <span
                className="text-3xl leading-none"
                style={
                  game?.status === "playing" && game.crossed === 0
                    ? { animation: "rush-bob 1.1s ease-in-out infinite" }
                    : undefined
                }
              >
                {game?.status === "playing" && game.crossed === 0 ? "🐔" : "🚦"}
              </span>
              <span className="mt-1 text-[9px] uppercase tracking-wider text-emerald-300/70">
                Curb
              </span>
            </div>

            {Array.from({ length: CHICKEN_LANES }, (_, idx) => {
              const lane = idx + 1; // 1-indexed lane
              const mult = chickenMultiplier(diff, lane);
              const isCrossed = !!game && lane <= game.crossed;
              const isChickenHere =
                !!game &&
                game.status !== "squashed" &&
                lane === game.crossed &&
                game.crossed > 0;
              const isNext =
                !!game && game.status === "playing" && lane === game.crossed + 1;
              const isCrashLane =
                !!game && game.status === "squashed" && game.crashLane === lane;
              // After a successful cash-out, reveal the lane a car was actually
              // waiting on — i.e. where the run *would* have ended had you kept
              // going. Mirrors Mines revealing its bombs once the round is over.
              // (crashLane is CHICKEN_LANES+1 on a clean run, so it can never
              // match a real lane here — nothing is revealed in that case.)
              const isWouldHaveLostLane =
                !!game &&
                game.status === "cashed" &&
                revealed &&
                game.crashLane === lane;

              let laneBg = "bg-transparent";
              if (isCrashLane) laneBg = "bg-red-600/25";
              else if (isWouldHaveLostLane) laneBg = "bg-red-500/15";
              else if (isChickenHere) laneBg = "bg-accent/20";
              else if (isCrossed) laneBg = "bg-accent/10";
              else if (isNext) laneBg = "bg-brand/10";

              const chipCls = isCrashLane
                ? "bg-red-500/50 text-red-50"
                : isWouldHaveLostLane
                  ? "bg-red-500/25 text-red-200"
                  : isNext
                    ? "bg-brand text-bg"
                    : isCrossed
                      ? "bg-accent/30 text-accent"
                      : "bg-black/40 text-muted";

              return (
                <button
                  key={lane}
                  ref={lane === focusLane ? activeRef : undefined}
                  disabled={!isNext || busy}
                  onClick={isNext ? step : undefined}
                  className={`relative flex h-28 w-16 shrink-0 flex-col items-center justify-between border-l-2 border-dashed border-white/10 py-2 transition-colors ${laneBg} ${
                    isNext ? "cursor-pointer hover:bg-brand/20 active:scale-95" : ""
                  }`}
                >
                  {/* glowing target ring on the next lane */}
                  {isNext && (
                    <span className="pointer-events-none absolute inset-1 animate-pulse rounded-md ring-2 ring-brand/70" />
                  )}
                  {/* top: forward arrow on the next lane */}
                  <span className="h-4 text-sm leading-none text-brand">
                    {isNext ? "▲" : ""}
                  </span>
                  {/* center: chicken / car / paw print */}
                  <span
                    className={`text-3xl leading-none ${
                      isWouldHaveLostLane ? "opacity-60" : ""
                    }`}
                    style={
                      isCrashLane
                        ? { animation: "rush-car 360ms ease-out both" }
                        : isWouldHaveLostLane
                          ? { animation: "rush-pop 300ms ease-out both" }
                          : isChickenHere
                            ? { animation: "rush-hop 360ms ease-out" }
                            : undefined
                    }
                  >
                    {isCrashLane
                      ? "🚗"
                      : isWouldHaveLostLane
                        ? "🚗"
                        : isChickenHere
                          ? "🐔"
                          : isCrossed
                            ? "🐾"
                            : ""}
                  </span>
                  {/* bottom: multiplier chip */}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${chipCls}`}
                  >
                    {mult.toFixed(2)}x
                  </span>
                </button>
              );
            })}

            {/* Finish line — clearing every lane lands here */}
            <div className="flex h-28 w-12 shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-white/10 bg-gradient-to-b from-zinc-600/40 to-zinc-900/40">
              <span className="text-2xl leading-none">🏁</span>
              <span className="mt-1 text-[9px] uppercase tracking-wider text-secondary/70">
                Safe
              </span>
            </div>
          </div>
          <div className="h-1.5 bg-gradient-to-r from-brand/50 via-brand/10 to-brand/50" />
        </div>
      </div>

      {/* Pre-game controls */}
      {!game && (
        <>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted">
              Difficulty
            </p>
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => {
                const risk = Math.round((1 - survivalProb(d)) * 100);
                return (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
                      difficulty === d
                        ? "bg-accent text-bg"
                        : "bg-bg text-secondary hover:bg-bg/70"
                    }`}
                  >
                    {LABELS[d]}
                    <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                      {risk}% risk
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted">Bet</p>
              <p className="text-[10px] text-muted">
                Max{" "}
                <span className="tabular-nums text-secondary">
                  {pts(MAX_BET_CENTS)} pts
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
            {busy ? "Crossing…" : "Start Crossing"}
          </Button>
        </>
      )}

      {/* Cash Out */}
      {game?.status === "playing" && (
        <Button
          onClick={cashout}
          disabled={busy || game.crossed === 0}
          className="w-full"
        >
          {game.crossed === 0
            ? "Tap the lane ahead to cross"
            : `Cash Out ${pts(potentialPayout)} pts`}
        </Button>
      )}

      {/* Result */}
      {game?.status === "squashed" && revealed && (
        <div className="space-y-2 rounded-md bg-red-500/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-red-300">🚗 Squashed</p>
          <p className="text-sm text-red-300">
            Lost {pts(game.betCents)} pts on lane {game.crashLane}
          </p>
          <button
            onClick={reset}
            className="text-xs font-semibold text-muted underline hover:text-white"
          >
            Play again
          </button>
        </div>
      )}
      {game?.status === "cashed" && revealed && lastPayout !== null && (
        <div className="space-y-2 rounded-md bg-accent/10 px-3 py-3 text-center">
          <p className="text-2xl font-black text-accent">+{pts(lastPayout)} pts</p>
          <p className="text-sm text-accent/80">
            Crossed {game.crossed} lanes at {game.multiplier.toFixed(2)}x
          </p>
          {game.crashLane && game.crashLane <= CHICKEN_LANES ? (
            <p className="text-xs text-red-300/90">
              🚗 A car was waiting on lane {game.crashLane} — you bailed{" "}
              {game.crashLane - game.crossed} lane
              {game.crashLane - game.crossed === 1 ? "" : "s"} early
            </p>
          ) : (
            <p className="text-xs text-emerald-300/80">
              🍀 The road was clear the whole way — you could&apos;ve gone for it
            </p>
          )}
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
