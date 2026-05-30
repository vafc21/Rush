"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { multiplierTable, ROWS, SLOTS, Risk } from "@/lib/games/plinko";

const STEP_MS = 70;

const RISK_LABELS: Record<Risk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

type ActiveDrop = {
  id: number;
  path: boolean[];
  slot: number;
  step: number;
  multiplier: number;
  betCents: number;
};

export function PlinkoGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [risk, setRisk] = useState<Risk>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drops, setDrops] = useState<ActiveDrop[]>([]);
  const [lastBank, setLastBank] = useState<{
    multiplier: number;
    slot: number;
    payoutCents: number;
    betCents: number;
  } | null>(null);
  const idRef = useRef(0);

  const table = multiplierTable(risk);

  // Animate each drop's step counter
  useEffect(() => {
    if (drops.length === 0) return;
    const t = setInterval(() => {
      setDrops((ds) =>
        ds
          .map((d) => ({ ...d, step: d.step + 1 }))
          .filter((d) => d.step <= ROWS + 4) // hold a few frames at the slot
      );
    }, STEP_MS);
    return () => clearInterval(t);
  }, [drops.length]);

  async function drop() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is $${(MAX_BET_CENTS / 100).toFixed(0)} per drop`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/plinko/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, risk }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "drop failed");
      return;
    }
    const data = (await res.json()) as {
      path: boolean[];
      slot: number;
      multiplier: number;
      payoutCents: number;
    };
    const id = ++idRef.current;
    setDrops((ds) => [
      ...ds,
      {
        id,
        path: data.path,
        slot: data.slot,
        step: 0,
        multiplier: data.multiplier,
        betCents,
      },
    ]);
    setLastBank({
      multiplier: data.multiplier,
      slot: data.slot,
      payoutCents: data.payoutCents,
      betCents,
    });
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🎯 Plinko</h2>
        <div className="flex gap-1">
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRisk(r)}
              disabled={busy}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                risk === r
                  ? "bg-accent text-bg"
                  : "bg-bg text-muted hover:text-white"
              }`}
            >
              {RISK_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Pegs + falling balls */}
      <div className="relative rounded-md bg-bg p-3" style={{ aspectRatio: `${SLOTS}/${ROWS + 2}` }}>
        <svg
          viewBox={`0 0 ${SLOTS * 10} ${(ROWS + 2) * 10}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          {/* Peg grid: row r (0-indexed) has r+1 pegs centered on x */}
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: r + 1 }, (_, i) => {
              const cx = SLOTS * 10 / 2 + (i - r / 2) * 10;
              const cy = (r + 1) * 10;
              return (
                <circle
                  key={`p-${r}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={0.8}
                  fill="#1A2C38"
                />
              );
            })
          )}

          {/* Active balls */}
          {drops.map((d) => {
            // After step k (0..ROWS), the ball is between row k-1 and row k.
            // Compute x by walking the path up to step k.
            const k = Math.min(d.step, ROWS);
            let rights = 0;
            for (let i = 0; i < k; i++) if (d.path[i]) rights++;
            const lefts = k - rights;
            const x = SLOTS * 10 / 2 + (rights - lefts) / 2 * 10;
            const y = k * 10 + 5;
            return (
              <circle
                key={d.id}
                cx={x}
                cy={y}
                r={1.6}
                fill="#FFB800"
                stroke="#0F212E"
                strokeWidth={0.3}
              />
            );
          })}
        </svg>
      </div>

      {/* Slots row with multipliers */}
      <div className="flex gap-0.5">
        {table.map((m, slot) => {
          const isHit = drops.some((d) => d.step >= ROWS && d.slot === slot);
          // color scale: low (≤1) muted, mid amber, high green
          const color =
            m >= 10
              ? "bg-accent text-bg"
              : m >= 2
                ? "bg-brand/80 text-bg"
                : m >= 1
                  ? "bg-bg text-secondary"
                  : "bg-bg/50 text-muted";
          return (
            <div
              key={slot}
              className={`flex flex-1 items-center justify-center rounded text-[10px] font-bold tabular-nums py-1 transition-all ${color} ${
                isHit ? "ring-2 ring-white scale-105" : ""
              }`}
            >
              {m}x
            </div>
          );
        })}
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

      <Button onClick={drop} disabled={busy} className="w-full">
        {busy ? "Dropping…" : "Drop Ball"}
      </Button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {lastBank && !error && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-semibold ${
            lastBank.payoutCents >= lastBank.betCents
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          Slot multi {lastBank.multiplier}x ·{" "}
          {lastBank.payoutCents >= lastBank.betCents ? "+" : ""}$
          {((lastBank.payoutCents - lastBank.betCents) / 100).toFixed(2)}
        </div>
      )}
    </div>
  );
}
