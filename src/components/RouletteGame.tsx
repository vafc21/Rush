"use client";
import { useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Bet, colorOf } from "@/lib/games/roulette";

type ChipBet = { bet: Bet; amountCents: number };

export function RouletteGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [chipDollars, setChipDollars] = useState("1");
  const [bets, setBets] = useState<ChipBet[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    n: number;
    color: "red" | "black" | "green";
    totalPayout: number;
    netDelta: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chipCents = Math.round(parseFloat(chipDollars || "0") * 100);
  const totalCents = bets.reduce((s, b) => s + b.amountCents, 0);

  function addBet(bet: Bet) {
    if (chipCents < 100) return;
    setResult(null);
    setBets((prev) => [...prev, { bet, amountCents: chipCents }]);
  }
  function clearBets() {
    setBets([]);
    setResult(null);
    setError(null);
  }

  async function spin() {
    if (bets.length === 0 || totalCents > MAX_BET_CENTS || totalCents > balanceCents) {
      setError(
        totalCents > balanceCents
          ? "Insufficient balance"
          : totalCents > MAX_BET_CENTS
            ? `Max total $${MAX_BET_CENTS / 100}`
            : "Place a bet first"
      );
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/roulette/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, bets }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "spin failed");
      return;
    }
    const data = (await res.json()) as {
      n: number;
      color: "red" | "black" | "green";
      totalPayout: number;
    };
    setResult({ ...data, netDelta: data.totalPayout - totalCents });
    setBets([]);
  }

  const numbersRow1 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
  const numbersRow2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
  const numbersRow3 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

  function CellNumber({ n }: { n: number }) {
    const c = colorOf(n);
    const bg = c === "red" ? "bg-red-600" : c === "black" ? "bg-bg" : "bg-accent";
    const flash =
      result && result.n === n ? "ring-2 ring-brand scale-110" : "";
    return (
      <button
        disabled={busy}
        onClick={() => addBet({ kind: "single", n })}
        className={`h-8 w-9 rounded text-xs font-bold tabular-nums text-white transition ${bg} hover:opacity-80 active:scale-95 ${flash}`}
      >
        {n}
      </button>
    );
  }

  return (
    <div className="w-full max-w-md space-y-3 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">🎡 Roulette</h2>

      {/* Spin result */}
      {result && (
        <div
          className={`flex items-center justify-between rounded-md px-3 py-2 ${
            result.netDelta >= 0 ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white ${
                result.color === "red"
                  ? "bg-red-600"
                  : result.color === "black"
                    ? "bg-bg"
                    : "bg-accent"
              }`}
            >
              {result.n}
            </span>
            <span className="text-sm font-bold">{result.color}</span>
          </span>
          <span className="text-sm font-bold tabular-nums">
            {result.netDelta >= 0 ? "+" : ""}${(result.netDelta / 100).toFixed(2)}
          </span>
        </div>
      )}

      {/* Number grid */}
      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          disabled={busy}
          onClick={() => addBet({ kind: "single", n: 0 })}
          className={`h-[6.25rem] w-9 shrink-0 rounded bg-accent text-xs font-bold text-bg hover:opacity-80 active:scale-95 ${
            result && result.n === 0 ? "ring-2 ring-brand scale-110" : ""
          }`}
        >
          0
        </button>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">{numbersRow1.map((n) => <CellNumber key={n} n={n} />)}</div>
          <div className="flex gap-1">{numbersRow2.map((n) => <CellNumber key={n} n={n} />)}</div>
          <div className="flex gap-1">{numbersRow3.map((n) => <CellNumber key={n} n={n} />)}</div>
        </div>
      </div>

      {/* Outside bets */}
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <button onClick={() => addBet({ kind: "dozen", dozen: 1 })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">1st 12</button>
        <button onClick={() => addBet({ kind: "dozen", dozen: 2 })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">2nd 12</button>
        <button onClick={() => addBet({ kind: "dozen", dozen: 3 })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">3rd 12</button>
        <button onClick={() => addBet({ kind: "half", half: "low" })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">1-18</button>
        <button onClick={() => addBet({ kind: "parity", parity: "even" })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">Even</button>
        <button onClick={() => addBet({ kind: "parity", parity: "odd" })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">Odd</button>
        <button onClick={() => addBet({ kind: "color", color: "red" })} disabled={busy} className="rounded bg-red-600 py-1.5 font-bold text-white">Red</button>
        <button onClick={() => addBet({ kind: "color", color: "black" })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-white ring-1 ring-panel">Black</button>
        <button onClick={() => addBet({ kind: "half", half: "high" })} disabled={busy} className="rounded bg-bg py-1.5 font-bold text-secondary hover:bg-bg/70">19-36</button>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          Chip ${(chipCents / 100).toFixed(2)} · {bets.length} bets · total ${(totalCents / 100).toFixed(2)}
        </span>
        <button onClick={clearBets} disabled={busy} className="text-muted hover:text-white underline">
          Clear
        </button>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
          type="number"
          min={1}
          step="1"
          value={chipDollars}
          disabled={busy}
          onChange={(e) => setChipDollars(e.target.value)}
        />
        <Button onClick={spin} disabled={busy || bets.length === 0} className="flex-1">
          {busy ? "Spinning…" : `Spin ($${(totalCents / 100).toFixed(2)})`}
        </Button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
