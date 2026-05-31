"use client";
import { useState } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import {
  POOL_SIZE,
  MIN_PICKS,
  MAX_PICKS,
  paytableFor,
} from "@/lib/games/keno";

const COLS = 8; // 8x5 grid = 40 numbers

type LastDraw = {
  drawn: number[];
  matched: number[];
  multiplier: number;
  payoutCents: number;
  betCents: number;
};

export function KenoGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<LastDraw | null>(null);

  function togglePick(n: number) {
    if (busy) return;
    setLast(null);
    setPicks((p) => {
      if (p.includes(n)) return p.filter((x) => x !== n);
      if (p.length >= MAX_PICKS) return p;
      return [...p, n];
    });
  }

  async function play(): Promise<boolean> {
    if (picks.length < MIN_PICKS) {
      setError(`Pick at least ${MIN_PICKS} number`);
      return false;
    }
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return false;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is $${(MAX_BET_CENTS / 100).toFixed(0)} per draw`);
      return false;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return false;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/keno/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, picks }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "play failed");
      return false;
    }
    const data = (await res.json()) as Omit<LastDraw, "betCents">;
    setLast({ ...data, betCents });
    return true;
  }

  const paytable = picks.length > 0 ? paytableFor(picks.length) : null;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🎱 Keno</h2>
        <div className="text-xs text-muted">
          {picks.length} / {MAX_PICKS} picked
        </div>
      </div>

      {/* 8×5 grid of numbers 1-40 */}
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: POOL_SIZE }, (_, i) => {
          const n = i + 1;
          const isPicked = picks.includes(n);
          const isMatched = last && last.matched.includes(n);
          const isDrawn = last && last.drawn.includes(n);
          let cls = "bg-bg text-secondary hover:bg-accent/20 cursor-pointer";
          if (last) {
            cls = "bg-bg/40 text-muted/50 cursor-default";
            if (isMatched) cls = "bg-accent/40 text-accent ring-1 ring-accent";
            else if (isPicked) cls = "bg-red-500/20 text-red-300";
            else if (isDrawn) cls = "bg-brand/20 text-brand";
          } else if (isPicked) {
            cls = "bg-accent text-bg";
          }
          return (
            <button
              key={n}
              disabled={busy || last !== null}
              onClick={() => togglePick(n)}
              className={`h-10 rounded-md text-sm font-bold tabular-nums transition-all active:scale-95 ${cls}`}
              style={isMatched ? { animation: "rush-pop 250ms ease-out" } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* Paytable preview */}
      {paytable && !last && (
        <div className="rounded-md bg-bg p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">
            Paytable (matches → multi)
          </p>
          <div className="flex flex-wrap gap-1 text-[10px] tabular-nums">
            {paytable.map((m, i) => (
              <div
                key={i}
                className={`rounded px-1.5 py-0.5 ${
                  m >= 10 ? "bg-accent/30 text-accent" : m >= 1 ? "bg-bg/60 text-secondary" : "bg-bg/30 text-muted"
                }`}
              >
                {i} → {m}x
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bet */}
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

      {!last ? (
        <Button onClick={play} disabled={busy || picks.length === 0} className="w-full">
          {busy ? "Drawing…" : picks.length === 0 ? "Pick numbers first" : "Draw"}
        </Button>
      ) : (
        <Button
          onClick={() => {
            setLast(null);
            setPicks([]);
          }}
          variant="secondary"
          className="w-full"
        >
          New draw
        </Button>
      )}
      <AutoBet
        onPlay={async () => {
          // Auto-bet re-runs the draw against the current picks. Clear
          // the previous result first so the UI updates between draws.
          if (last) setLast(null);
          return play();
        }}
        pauseMs={300}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && (
        <div
          className={`space-y-1 rounded-md px-3 py-2 text-center text-sm font-semibold ${
            last.payoutCents > 0
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          <div>
            {last.matched.length} / {picks.length} matched · {last.multiplier}x
          </div>
          <div>
            {last.payoutCents >= last.betCents
              ? `+$${((last.payoutCents - last.betCents) / 100).toFixed(2)}`
              : `-$${((last.betCents - last.payoutCents) / 100).toFixed(2)}`}
          </div>
        </div>
      )}
    </div>
  );
}
