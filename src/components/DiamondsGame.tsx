"use client";
import { useState } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { WinBurst } from "./WinBurst";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Gem } from "@/lib/games/diamonds";
import { pts } from "@/lib/format";

const DEFAULT_GEMS = ["🟡", "🟢", "🔵", "🟣", "🟠"] as Gem[];

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
  // Cluster result is shown only after the gems finish dealing.
  const [revealed, setRevealed] = useState(false);

  async function play(): Promise<boolean> {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Min bet ${pts(MIN_BET_CENTS)} pts`);
      return false;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet ${pts(MAX_BET_CENTS)} pts`);
      return false;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return false;
    }
    setBusy(true);
    setError(null);
    setRevealed(false);
    setLast(null);
    const res = await fetch("/api/games/diamonds/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "deal failed");
      setBusy(false);
      return false;
    }
    const data = await res.json();
    setLast({ ...data, betCents });
    // Let the gems deal out before revealing the cluster result.
    await new Promise((r) => setTimeout(r, 700));
    setRevealed(true);
    setBusy(false);
    return true;
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">💎 Diamonds</h2>

      <div className="relative grid grid-cols-5 gap-2">
        <WinBurst
          trigger={revealed && last?.cluster ? `${last.cluster.gem}-${last.cluster.size}` : false}
          intensity={last?.cluster && last.cluster.size >= 4 ? 1.8 : 1}
        />
        {(last?.hand ?? DEFAULT_GEMS).map((g, i) => {
          const isInCluster = revealed && last?.cluster && last.cluster.gem === g;
          // After a deal, each gem slides into place with a stagger so the
          // hand "deals out". Transform-only (see rush-deal) so a gem is
          // never left blank if the animation stalls. The key includes the
          // round so React remounts and replays the deal each round.
          return (
            <div
              key={`${last ? "r" : "d"}-${i}`}
              className={`flex aspect-square items-center justify-center rounded-md bg-bg text-4xl ${
                isInCluster ? "ring-2 ring-accent" : ""
              }`}
              style={
                last
                  ? { animation: "rush-deal 300ms ease-out both", animationDelay: `${i * 70}ms` }
                  : undefined
              }
            >
              {g}
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Bet</span>
          <span className="text-[10px]">Max {pts(MAX_BET_CENTS)} pts</span>
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
      <AutoBet onPlay={play} pauseMs={200} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && revealed && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
            last.multiplier > 0
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          {last.cluster
            ? `${last.cluster.size}× ${last.cluster.gem} · ${last.multiplier}x · +${pts(last.payoutCents - last.betCents)} pts`
            : `No cluster · -${pts(last.betCents)} pts`}
        </div>
      )}
    </div>
  );
}
