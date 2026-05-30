"use client";
import { useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Gem } from "@/lib/games/diamonds";

type Result = {
  hand: Gem[];
  multiplier: number;
  cluster: { gem: Gem; size: number } | null;
  payoutCents: number;
  betCents: number;
};

export function DiamondsGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Result | null>(null);

  async function play() {
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
    const res = await fetch("/api/games/diamonds/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "deal failed");
      return;
    }
    const data = await res.json();
    setLast({ ...data, betCents });
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">💎 Diamonds</h2>

      <div className="grid grid-cols-5 gap-2">
        {(last?.hand ?? ["🟡", "🟢", "🔵", "🟣", "🟠"] as Gem[]).map((g, i) => {
          const isInCluster = last?.cluster && last.cluster.gem === g;
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-md bg-bg text-4xl ${
                isInCluster ? "ring-2 ring-accent scale-105" : ""
              }`}
              style={isInCluster ? { animation: "rush-pop 250ms ease-out" } : undefined}
            >
              {g}
            </div>
          );
        })}
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
      <Button onClick={play} disabled={busy} className="w-full">
        {busy ? "Dealing…" : "Deal"}
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
            last.multiplier > 0
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          {last.cluster
            ? `${last.cluster.size}× ${last.cluster.gem} · ${last.multiplier}x · +$${((last.payoutCents - last.betCents) / 100).toFixed(2)}`
            : `No cluster · -$${(last.betCents / 100).toFixed(2)}`}
        </div>
      )}
    </div>
  );
}
