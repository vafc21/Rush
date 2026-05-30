"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";

const SUSPENSE_MS = 900;

type LastRoll = {
  won: boolean;
  targetMultiplier: number;
  rolledCrashPoint: number;
  payoutCents: number;
  betCents: number;
};

export function LimboGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [targetMultiplier, setTargetMultiplier] = useState("2.00");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastRoll | null>(null);
  const [displayMultiplier, setDisplayMultiplier] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled">("idle");
  const hopRef = useRef<number | null>(null);
  const settleRef = useRef<number | null>(null);

  const target = Math.max(1.01, Math.min(1000, parseFloat(targetMultiplier) || 0));
  // Win chance under 99% RTP Crash formula: 99/(target*100) × 100
  const winChancePct = (99 / target);

  useEffect(() => {
    return () => {
      if (hopRef.current) clearInterval(hopRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  async function roll() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is $${(MAX_BET_CENTS / 100).toFixed(0)} per roll`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    setLast(null);
    setPhase("rolling");

    // Slot-machine cycle of random multipliers during suspense
    if (hopRef.current) clearInterval(hopRef.current);
    hopRef.current = window.setInterval(() => {
      // bias toward small numbers like Crash distribution
      const r = Math.random();
      setDisplayMultiplier(Math.max(1, 99 / (r * 100)));
    }, 60);

    const fetchPromise = fetch("/api/games/limbo/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId,
        betCents,
        targetMultiplier: target,
      }),
    });

    const [res] = await Promise.all([
      fetchPromise,
      new Promise((r) => {
        settleRef.current = window.setTimeout(r, SUSPENSE_MS);
      }),
    ]);

    if (hopRef.current) clearInterval(hopRef.current);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "roll failed");
      setBusy(false);
      setPhase("idle");
      return;
    }
    const data = (await res.json()) as Omit<LastRoll, "betCents">;
    setDisplayMultiplier(data.rolledCrashPoint);
    setLast({ ...data, betCents });
    setPhase("settled");
    setBusy(false);
  }

  const shown = displayMultiplier ?? 1.0;
  const numberColor = !last
    ? phase === "rolling"
      ? "text-white"
      : "text-muted"
    : last.won
      ? "text-accent"
      : "text-red-300";

  return (
    <div className="w-full max-w-md space-y-5 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🌙 Limbo</h2>
        <div className="text-xs text-muted">
          Win chance{" "}
          <span className="text-white tabular-nums">{winChancePct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Big multiplier display */}
      <div
        className={`flex h-32 items-center justify-center rounded-md border border-bg transition-all ${
          phase === "settled"
            ? last?.won
              ? "ring-2 ring-accent shadow-[0_0_24px_rgba(0,231,1,0.35)]"
              : "ring-2 ring-red-500"
            : ""
        }`}
      >
        <div
          className={`text-6xl font-black tabular-nums transition-colors ${numberColor}`}
          style={{
            textShadow:
              phase === "settled" && last?.won
                ? "0 0 24px rgba(0,231,1,0.45)"
                : undefined,
          }}
        >
          {shown.toFixed(2)}x
        </div>
      </div>

      {/* Target multiplier */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wider text-muted">
            Target multiplier
          </p>
          <p className="text-[10px] text-muted">
            payout{" "}
            <span className="tabular-nums text-accent">
              ${((parseFloat(betDollars || "0") || 0) * target).toFixed(2)}
            </span>{" "}
            if rolled ≥ target
          </p>
        </div>
        <input
          className="w-full rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
          type="number"
          min="1.01"
          max="1000"
          step="0.10"
          value={targetMultiplier}
          disabled={busy}
          onChange={(e) => setTargetMultiplier(e.target.value)}
        />
      </div>

      {/* Bet */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wider text-muted">Bet</p>
          <p className="text-[10px] text-muted">
            Max{" "}
            <span className="tabular-nums text-secondary">
              ${(MAX_BET_CENTS / 100).toFixed(0)}
            </span>{" "}
            / roll
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

      <Button onClick={roll} disabled={busy} className="w-full">
        {busy ? "Rolling…" : "Roll"}
      </Button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && !error && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-semibold ${
            last.won
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          {last.won
            ? `Hit ${last.targetMultiplier.toFixed(2)}x · +$${(last.payoutCents / 100).toFixed(2)}`
            : `Rolled ${last.rolledCrashPoint.toFixed(2)}x · target was ${last.targetMultiplier.toFixed(2)}x`}
        </div>
      )}
    </div>
  );
}
