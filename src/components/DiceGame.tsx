"use client";
import { useState } from "react";
import { Button } from "./Button";

export function DiceGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [rollUnder, setRollUnder] = useState(50);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{
    won: boolean;
    roll: number;
    payoutCents: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const multiplier = (0.99 * 100) / rollUnder;

  async function roll() {
    const betCents = Math.round(parseFloat(betDollars) * 100);
    if (!betCents || betCents < 100) {
      setError("Minimum bet is $1.00");
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/dice/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, rollUnder }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Roll failed");
      return;
    }
    setLast(await res.json());
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">🎲 Dice</h2>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted">Bet</p>
        <input
          className="w-full rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none"
          type="number"
          min="1"
          step="0.50"
          value={betDollars}
          onChange={(e) => setBetDollars(e.target.value)}
        />
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted">
          Roll under: <span className="text-white">{rollUnder}</span> &nbsp;|&nbsp;
          Multiplier: <span className="text-accent">{multiplier.toFixed(2)}x</span>
        </p>
        <input
          type="range"
          min={2}
          max={98}
          value={rollUnder}
          onChange={(e) => setRollUnder(parseInt(e.target.value))}
          className="w-full"
        />
      </div>
      <Button onClick={roll} disabled={busy} className="w-full">
        {busy ? "Rolling…" : "Roll"}
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && (
        <div
          className={`rounded-md p-3 text-center ${
            last.won ? "bg-accent/20 text-accent" : "bg-red-500/20 text-red-300"
          }`}
        >
          <div className="text-3xl font-black tabular-nums">{last.roll.toFixed(2)}</div>
          <div className="text-sm">
            {last.won ? `Won $${(last.payoutCents / 100).toFixed(2)}` : "Lost"}
          </div>
        </div>
      )}
    </div>
  );
}
