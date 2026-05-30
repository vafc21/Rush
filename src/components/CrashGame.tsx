"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import {
  multiplierAtElapsed,
  secondsToReachMultiplier,
} from "@/lib/games/crash";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { useLobbyChannel } from "@/lib/realtime/pusher-client";
import type { LobbyEvent } from "@/lib/realtime/events";

type Phase = "waiting" | "betting" | "running" | "aftermath";

type Round = {
  id: string;
  startAtMs: number;
  crashAt: number;
};

type MyBet = {
  betId: string;
  betCents: number;
  status: "pending" | "cashed" | "lost";
  cashedAt?: number;
};

type FloatingCashout = {
  id: number;
  multiplier: number;
};

const AFTERMATH_MS = 3_000;
const FRAME_RATE_HZ = 30;

export function CrashGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [round, setRound] = useState<Round | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [myBet, setMyBet] = useState<MyBet | null>(null);
  const [betDollars, setBetDollars] = useState("1");
  const [autoCashout, setAutoCashout] = useState("2.00");
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [floats, setFloats] = useState<FloatingCashout[]>([]);
  const floatIdRef = useRef(0);

  // Animation tick (only while we have a live round)
  useEffect(() => {
    if (!round) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000 / FRAME_RATE_HZ);
    return () => clearInterval(t);
  }, [round]);

  // Kickstart: if there's no round when we mount, fire the crash-tick cron
  // so a round gets generated (local-dev convenience).
  useEffect(() => {
    if (round) return;
    fetch("/api/cron/crash-tick").catch(() => {});
  }, [round]);

  // Listen for round_start, round_end, cashout
  const handleEvent = (e: LobbyEvent) => {
    if (e.type === "crash_round_start") {
      setRound({
        id: e.roundId,
        startAtMs: e.startAtMs,
        crashAt: e.crashAt,
      });
      setMyBet(null);
      setError(null);
    } else if (e.type === "crash_round_end") {
      setRound((r) => {
        // Mark as crashed but keep showing until aftermath ends
        if (!r || r.id !== e.roundId) return r;
        // If we still have a pending bet, treat it as lost
        setMyBet((b) => (b && b.status === "pending" ? { ...b, status: "lost" } : b));
        return r;
      });
    } else if (e.type === "crash_cashout") {
      // Show floating "X cashed at 2.4x" for other players' cashouts
      const id = ++floatIdRef.current;
      setFloats((f) => [...f, { id, multiplier: e.multiplier }]);
      setTimeout(() => {
        setFloats((f) => f.filter((fl) => fl.id !== id));
      }, 1500);
    }
  };
  useLobbyChannel(lobbyId, handleEvent);

  // Derive the current phase from round + clock
  let phase: Phase = "waiting";
  let elapsedSec = 0;
  let currentMultiplier = 1;
  if (round) {
    if (nowMs < round.startAtMs) {
      phase = "betting";
    } else {
      elapsedSec = (nowMs - round.startAtMs) / 1000;
      const crashElapsedSec = secondsToReachMultiplier(round.crashAt);
      const crashedAtMs = round.startAtMs + crashElapsedSec * 1000;
      if (nowMs < crashedAtMs) {
        phase = "running";
        currentMultiplier = multiplierAtElapsed(elapsedSec);
      } else if (nowMs < crashedAtMs + AFTERMATH_MS) {
        phase = "aftermath";
        currentMultiplier = round.crashAt;
      } else {
        // Old round finished — wait for the next cron tick to provide one.
        phase = "waiting";
        // Help things along in local dev
        fetch("/api/cron/crash-tick").catch(() => {});
      }
    }
  }

  // Auto-cashout (client-side guard so the cashout happens even if the
  // server cron is slow). The server still validates the multiplier.
  useEffect(() => {
    if (phase !== "running" || !myBet || myBet.status !== "pending") return;
    if (!autoCashoutEnabled) return;
    const target = parseFloat(autoCashout);
    if (Number.isNaN(target) || target < 1.01) return;
    if (currentMultiplier >= target) {
      cashout(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myBet?.status, currentMultiplier, autoCashoutEnabled]);

  // Countdown shown during betting window
  const secondsToStart = round
    ? Math.max(0, (round.startAtMs - nowMs) / 1000)
    : 0;

  async function placeBet() {
    if (!round || phase !== "betting") return;
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is $${(MAX_BET_CENTS / 100).toFixed(0)} per round`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    const auto = autoCashoutEnabled ? parseFloat(autoCashout) : undefined;
    const res = await fetch("/api/games/crash/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: round.id,
        betCents,
        autoCashoutAt: auto,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "bet failed");
      return;
    }
    const data = (await res.json()) as { betId: string };
    setMyBet({ betId: data.betId, betCents, status: "pending" });
  }

  async function cashout(forceMultiplier?: number) {
    if (!myBet || myBet.status !== "pending") return;
    if (phase !== "running") return;
    setBusy(true);
    const m = forceMultiplier ?? currentMultiplier;
    const res = await fetch("/api/games/crash/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: myBet.betId, multiplier: m }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMyBet({ ...myBet, status: "lost" });
      setError(body.error ?? "cashout failed");
      return;
    }
    const data = (await res.json()) as {
      multiplier: number;
      payoutCents: number;
    };
    setMyBet({ ...myBet, status: "cashed", cashedAt: data.multiplier });
  }

  // Visual rocket curve — sample 60 points from t=0 to current elapsed
  const points = (() => {
    const pts: Array<[number, number]> = [];
    if (phase === "running" || phase === "aftermath") {
      const finalT =
        phase === "aftermath"
          ? secondsToReachMultiplier(round!.crashAt)
          : elapsedSec;
      const samples = 60;
      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * finalT;
        pts.push([t, multiplierAtElapsed(t)]);
      }
    }
    return pts;
  })();

  // Chart bounds — fit curve within viewBox
  const W = 400;
  const H = 200;
  const tMax = points.length > 0 ? points[points.length - 1][0] : 1;
  const mMax = points.length > 0 ? points[points.length - 1][1] : 2;
  const pad = 0.05;
  const xScale = (t: number) =>
    (t / Math.max(1, tMax)) * (W * (1 - pad)) + W * pad * 0.3;
  const yScale = (m: number) => {
    // log-ish scaling so high multipliers don't blow up
    const normalized = (m - 1) / Math.max(0.1, mMax - 1);
    return H - normalized * (H * 0.85) - H * 0.1;
  };

  const rocketX = points.length > 0 ? xScale(points[points.length - 1][0]) : 0;
  const rocketY = points.length > 0 ? yScale(points[points.length - 1][1]) : H;

  const crashed = phase === "aftermath";
  const multiplierColor = crashed
    ? "text-red-400"
    : phase === "running"
      ? "text-accent"
      : "text-muted";

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🚀 Crash</h2>
        <div className="text-xs text-muted">
          {phase === "betting" && (
            <span className="font-bold tabular-nums text-brand">
              Betting · {secondsToStart.toFixed(1)}s
            </span>
          )}
          {phase === "running" && (
            <span className="font-bold text-accent">Live</span>
          )}
          {phase === "aftermath" && (
            <span className="font-bold text-red-400">Crashed</span>
          )}
          {phase === "waiting" && <span>Next round soon…</span>}
        </div>
      </div>

      {/* Curve + multiplier */}
      <div className="relative h-48 overflow-hidden rounded-md bg-bg">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          {/* Background grid */}
          <line
            x1={0}
            x2={W}
            y1={H - H * 0.1}
            y2={H - H * 0.1}
            stroke="#1A2C38"
            strokeWidth={0.5}
          />
          {points.length > 1 && (
            <>
              {/* Curve glow */}
              <polyline
                points={points
                  .map(([t, m]) => `${xScale(t)},${yScale(m)}`)
                  .join(" ")}
                fill="none"
                stroke={crashed ? "#EF4444" : "#00E701"}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
              />
              {/* Curve line */}
              <polyline
                points={points
                  .map(([t, m]) => `${xScale(t)},${yScale(m)}`)
                  .join(" ")}
                fill="none"
                stroke={crashed ? "#EF4444" : "#00E701"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Filled area below */}
              <polyline
                points={[
                  `${xScale(0)},${H}`,
                  ...points.map(([t, m]) => `${xScale(t)},${yScale(m)}`),
                  `${rocketX},${H}`,
                ].join(" ")}
                fill={crashed ? "#EF4444" : "#00E701"}
                opacity={0.08}
              />
              {/* Rocket head */}
              <circle
                cx={rocketX}
                cy={rocketY}
                r={4}
                fill={crashed ? "#EF4444" : "#00E701"}
              />
            </>
          )}
        </svg>
        {/* Multiplier overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`text-6xl font-black tabular-nums transition-colors ${multiplierColor}`}
            style={{
              textShadow:
                phase === "running"
                  ? "0 0 24px rgba(0,231,1,0.4)"
                  : crashed
                    ? "0 0 20px rgba(239,68,68,0.45)"
                    : undefined,
            }}
          >
            {currentMultiplier.toFixed(2)}x
          </div>
        </div>
        {/* Other-player cashout floaters */}
        <div className="pointer-events-none absolute inset-0">
          {floats.map((f) => (
            <div
              key={f.id}
              className="absolute right-3 top-3 rounded-md bg-accent/20 px-2 py-1 text-xs font-bold text-accent"
              style={{ animation: "rush-fade 1.5s ease-out forwards" }}
            >
              ↑ {f.multiplier.toFixed(2)}x
            </div>
          ))}
        </div>
      </div>

      {/* Bet panel (during betting/waiting) */}
      {phase !== "running" && !myBet && (
        <>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted">Bet</p>
              <p className="text-[10px] text-muted">
                Max{" "}
                <span className="tabular-nums text-secondary">
                  ${(MAX_BET_CENTS / 100).toFixed(0)}
                </span>{" "}
                / round
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

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={autoCashoutEnabled}
                onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                className="accent-accent"
              />
              Auto cash out at
            </label>
            <input
              type="number"
              min="1.01"
              step="0.10"
              value={autoCashout}
              onChange={(e) => setAutoCashout(e.target.value)}
              disabled={!autoCashoutEnabled}
              className="w-20 rounded-md bg-bg px-2 py-1 text-center text-sm tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition disabled:opacity-40"
            />
            <span className="text-xs text-muted">x</span>
          </div>

          <Button
            onClick={placeBet}
            disabled={busy || phase !== "betting"}
            className="w-full"
          >
            {phase === "betting"
              ? busy
                ? "Placing…"
                : `Bet $${betDollars}`
              : "Waiting for next round…"}
          </Button>
        </>
      )}

      {/* Cashout button (during run) */}
      {phase === "running" && myBet?.status === "pending" && (
        <Button
          onClick={() => cashout()}
          disabled={busy}
          className="w-full text-base"
        >
          Cash Out · $
          {(Math.floor(myBet.betCents * currentMultiplier) / 100).toFixed(2)}
        </Button>
      )}

      {/* Result panels */}
      {myBet?.status === "cashed" && (
        <div className="rounded-md bg-accent/10 px-3 py-2 text-center text-sm font-bold text-accent">
          Cashed at {myBet.cashedAt?.toFixed(2)}x · +$
          {(Math.floor(myBet.betCents * (myBet.cashedAt ?? 1)) / 100).toFixed(2)}
        </div>
      )}
      {myBet?.status === "lost" && (
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-center text-sm font-bold text-red-300">
          Crashed at {round?.crashAt.toFixed(2)}x · –${(myBet.betCents / 100).toFixed(2)}
        </div>
      )}
      {phase === "betting" && myBet?.status === "pending" && (
        <div className="rounded-md bg-bg/40 px-3 py-2 text-center text-xs text-muted">
          Bet of ${(myBet.betCents / 100).toFixed(2)} placed — waiting for liftoff
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
