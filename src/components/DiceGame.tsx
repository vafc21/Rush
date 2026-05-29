"use client";
import { useState } from "react";
import { Button } from "./Button";

type LastRoll = {
  won: boolean;
  roll: number;
  payoutCents: number;
  betCents: number;
};

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
  const [last, setLast] = useState<LastRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  // markerValue drives the visual marker position. When we start a roll we
  // briefly clear it (so the marker can transition smoothly to the new value),
  // then set it to the rolled number after a tick of suspense.
  const [markerValue, setMarkerValue] = useState<number | null>(null);
  // flashes the result panel briefly to mark a win/loss
  const [flash, setFlash] = useState<"win" | "loss" | null>(null);

  const multiplier = (0.99 * 100) / rollUnder;
  const winChance = rollUnder; // because target = rollUnder / 100 over [0,100)

  async function roll() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
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

    // Tiny suspense window so the marker has somewhere to come from.
    // We also clear the previous result so the panel resets visually.
    setMarkerValue(null);
    setLast(null);
    setFlash(null);

    const res = await fetch("/api/games/dice/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, rollUnder }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Roll failed");
      setBusy(false);
      return;
    }

    const result = (await res.json()) as Omit<LastRoll, "betCents">;
    // Drop the marker at center-ish first, then animate to result. Using
    // requestAnimationFrame ensures the browser paints the "null" state
    // before we set the next value, so the CSS transition runs.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMarkerValue(result.roll);
        setLast({ ...result, betCents });
        setFlash(result.won ? "win" : "loss");
        setBusy(false);
        // Clear the flash after the animation finishes.
        setTimeout(() => setFlash(null), 700);
      });
    });
  }

  return (
    <div className="w-full max-w-md space-y-5 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🎲 Dice</h2>
        <div className="text-xs text-muted">
          Win chance{" "}
          <span className="text-white tabular-nums">
            {winChance.toFixed(0)}%
          </span>{" "}
          · Multi{" "}
          <span className="tabular-nums text-accent">
            {multiplier.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* The scale */}
      <div className="space-y-2">
        <div
          className={`relative h-24 overflow-hidden rounded-md border border-bg ${
            flash === "win"
              ? "ring-2 ring-accent"
              : flash === "loss"
                ? "ring-2 ring-red-500"
                : ""
          }`}
        >
          {/* Win zone (green) — width = rollUnder% */}
          <div
            className="absolute inset-y-0 left-0 bg-accent/15 transition-[width] duration-150"
            style={{ width: `${rollUnder}%` }}
          />
          {/* Lose zone (red) — fills the rest */}
          <div
            className="absolute inset-y-0 right-0 bg-red-500/15 transition-[width] duration-150"
            style={{ width: `${100 - rollUnder}%` }}
          />
          {/* Boundary line */}
          <div
            className="absolute inset-y-0 w-px bg-brand"
            style={{ left: `${rollUnder}%` }}
          />
          {/* Marker (the rolled value). Slides in on result. */}
          {markerValue !== null && (
            <div
              className={`absolute -top-1 bottom-[-4px] flex flex-col items-center transition-[left] duration-700 ease-out`}
              style={{
                left: `${markerValue}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className={`h-2 w-2 rotate-45 ${
                  last?.won ? "bg-accent" : "bg-red-400"
                }`}
              />
              <div
                className={`w-0.5 flex-1 ${
                  last?.won ? "bg-accent" : "bg-red-400"
                }`}
              />
            </div>
          )}
          {/* Big number in the middle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`text-4xl font-black tabular-nums transition-colors ${
                !last
                  ? "text-muted"
                  : last.won
                    ? "text-accent"
                    : "text-red-300"
              }`}
            >
              {last ? last.roll.toFixed(2) : "00.00"}
            </div>
          </div>
        </div>

        {/* Scale ticks */}
        <div className="flex justify-between px-0.5 text-[10px] text-muted tabular-nums">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      {/* Roll-under slider */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wider text-muted">
            Roll under
          </p>
          <p className="text-sm font-semibold tabular-nums text-white">
            {rollUnder}
          </p>
        </div>
        <input
          type="range"
          min={2}
          max={98}
          value={rollUnder}
          onChange={(e) => setRollUnder(parseInt(e.target.value))}
          disabled={busy}
          className="w-full accent-accent"
        />
      </div>

      {/* Bet input */}
      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted">Bet</p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none"
            type="number"
            min="1"
            step="0.50"
            value={betDollars}
            disabled={busy}
            onChange={(e) => setBetDollars(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setBetDollars((Math.max(1, parseFloat(betDollars || "1") / 2)).toFixed(2))
            }
            className="rounded-md bg-bg px-3 text-xs font-semibold text-secondary disabled:opacity-50"
          >
            ½
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setBetDollars((parseFloat(betDollars || "1") * 2).toFixed(2))
            }
            className="rounded-md bg-bg px-3 text-xs font-semibold text-secondary disabled:opacity-50"
          >
            2×
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
            ? `Won $${(last.payoutCents / 100).toFixed(2)}`
            : `Lost $${(last.betCents / 100).toFixed(2)}`}
        </div>
      )}
    </div>
  );
}
