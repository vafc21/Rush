"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Symbol, SYMBOLS } from "@/lib/games/slots";

const SPIN_FRAMES_MS = 80;
const SPIN_DURATIONS_MS = [1100, 1500, 1900]; // staggered per reel

export function SlotsGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reels, setReels] = useState<[Symbol, Symbol, Symbol]>(["🍒", "🍋", "🔔"]);
  const [last, setLast] = useState<{
    multiplier: number;
    payoutCents: number;
    betCents: number;
  } | null>(null);
  const [spinningReels, setSpinningReels] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const spinIntervalsRef = useRef<Array<number | null>>([null, null, null]);

  useEffect(() => {
    return () => {
      spinIntervalsRef.current.forEach((id) => id && clearInterval(id));
    };
  }, []);

  async function spin() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Min bet $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet $${(MAX_BET_CENTS / 100).toFixed(0)}`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    setLast(null);
    setSpinningReels([true, true, true]);

    // Start cycling each reel through random symbols
    for (let i = 0; i < 3; i++) {
      spinIntervalsRef.current[i] = window.setInterval(() => {
        setReels((prev) => {
          const next = [...prev] as [Symbol, Symbol, Symbol];
          next[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
          return next;
        });
      }, SPIN_FRAMES_MS);
    }

    const res = await fetch("/api/games/slots/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents }),
    });
    if (!res.ok) {
      // bail fast
      spinIntervalsRef.current.forEach((id) => id && clearInterval(id));
      setSpinningReels([false, false, false]);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "spin failed");
      setBusy(false);
      return;
    }
    const data = (await res.json()) as {
      reels: [Symbol, Symbol, Symbol];
      multiplier: number;
      payoutCents: number;
    };

    // Settle each reel after its stagger
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const id = spinIntervalsRef.current[i];
        if (id) clearInterval(id);
        spinIntervalsRef.current[i] = null;
        setReels((prev) => {
          const next = [...prev] as [Symbol, Symbol, Symbol];
          next[i] = data.reels[i];
          return next;
        });
        setSpinningReels((prev) => {
          const next = [...prev] as [boolean, boolean, boolean];
          next[i] = false;
          return next;
        });
        if (i === 2) {
          setLast({ multiplier: data.multiplier, payoutCents: data.payoutCents, betCents });
          setBusy(false);
        }
      }, SPIN_DURATIONS_MS[i]);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">🎰 Slots</h2>

      <div className="grid grid-cols-3 gap-2">
        {reels.map((sym, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-md bg-bg text-5xl ${
              spinningReels[i] ? "blur-[1px]" : ""
            }`}
          >
            {sym}
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Bet</span>
          <span className="text-[10px]">Max ${(MAX_BET_CENTS / 100).toFixed(0)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60"
            type="number"
            min={MIN_BET_CENTS / 100}
            max={MAX_BET_CENTS / 100}
            step="0.50"
            value={betDollars}
            disabled={busy}
            onChange={(e) => setBetDollars(e.target.value)}
          />
          <button
            onClick={() =>
              setBetDollars((Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2))
            }
            disabled={busy}
            className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand hover:bg-brand/25 active:scale-95"
          >
            Max
          </button>
        </div>
      </div>

      <Button onClick={spin} disabled={busy} className="w-full">
        {busy ? "Spinning…" : "Spin"}
      </Button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && !busy && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
            last.multiplier > 0 ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-300"
          }`}
        >
          {last.multiplier > 0
            ? `${last.multiplier}x · +$${((last.payoutCents - last.betCents) / 100).toFixed(2)}`
            : `-$${(last.betCents / 100).toFixed(2)}`}
        </div>
      )}
    </div>
  );
}
