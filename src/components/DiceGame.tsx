"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { WinBurst } from "./WinBurst";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";

type LastRoll = {
  won: boolean;
  roll: number;
  payoutCents: number;
  betCents: number;
};

const SUSPENSE_MS = 900;
const SETTLE_MS = 700;
const SUSPENSE_HOP_MS = 70;

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
  // markerValue drives the marker's horizontal position. During suspense
  // we set it to random values to fake a slot-machine cycle; after settle
  // we set it to the real rolled value.
  const [markerValue, setMarkerValue] = useState<number | null>(null);
  // displayNumber is what the big number in the middle of the scale shows.
  // It cycles through random values during suspense, then locks to the
  // real result.
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  // 'rolling' is the suspense phase. 'settled' is the final phase.
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled">("idle");
  // flashes the result panel briefly to mark a win/loss
  const [flash, setFlash] = useState<"win" | "loss" | null>(null);
  // Brief recently-won shine on the multiplier text
  const [shine, setShine] = useState(false);

  const multiplier = (0.99 * 100) / rollUnder;
  const winChance = rollUnder;

  // Cleanup intervals/timeouts on unmount
  const hopIntervalRef = useRef<number | null>(null);
  const finalTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (hopIntervalRef.current) clearInterval(hopIntervalRef.current);
      if (finalTimeoutRef.current) clearTimeout(finalTimeoutRef.current);
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
    setFlash(null);
    setShine(false);
    setPhase("rolling");

    // Start the suspense cycle: every SUSPENSE_HOP_MS, jump the marker
    // to a new random position and update the displayed number.
    if (hopIntervalRef.current) clearInterval(hopIntervalRef.current);
    hopIntervalRef.current = window.setInterval(() => {
      const v = Math.random() * 100;
      setMarkerValue(v);
      setDisplayNumber(v);
    }, SUSPENSE_HOP_MS);

    // Fire the request in parallel with the suspense animation.
    const fetchPromise = fetch("/api/games/dice/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, rollUnder }),
    });

    // Wait for both the suspense window to elapse AND the request to land.
    const [res] = await Promise.all([
      fetchPromise,
      new Promise((r) => {
        finalTimeoutRef.current = window.setTimeout(r, SUSPENSE_MS);
      }),
    ]);

    if (hopIntervalRef.current) {
      clearInterval(hopIntervalRef.current);
      hopIntervalRef.current = null;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Roll failed");
      setBusy(false);
      setPhase("idle");
      return;
    }

    const result = (await res.json()) as Omit<LastRoll, "betCents">;

    // Settle: lock the marker and number to the real result with a
    // smooth CSS transition.
    setMarkerValue(result.roll);
    setDisplayNumber(result.roll);
    setLast({ ...result, betCents });
    setFlash(result.won ? "win" : "loss");
    setPhase("settled");
    setBusy(false);
    if (result.won) setShine(true);

    setTimeout(() => setFlash(null), SETTLE_MS);
    setTimeout(() => setShine(false), 1500);
  }

  const markerColor = !last
    ? "bg-muted"
    : last.won
      ? "bg-accent"
      : "bg-red-400";

  const numberColor =
    phase === "rolling"
      ? "text-white"
      : !last
        ? "text-muted"
        : last.won
          ? "text-accent"
          : "text-red-300";

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
          <span
            className={`tabular-nums transition-all duration-300 ${
              shine ? "text-brand drop-shadow-[0_0_10px_rgba(255,184,0,0.5)]" : "text-accent"
            }`}
          >
            {multiplier.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* The scale */}
      <div className="relative space-y-2">
        <WinBurst
          trigger={last && last.won ? `${phase}-${last.roll}` : false}
          intensity={last && last.won && last.payoutCents > last.betCents * 3 ? 1.6 : 1}
        />
        <div
          className={`relative h-24 overflow-hidden rounded-md border border-bg transition-all duration-300 ${
            flash === "win"
              ? "ring-2 ring-accent shadow-[0_0_24px_rgba(0,231,1,0.35)]"
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
          {/* Marker (the rolled value). Hops during suspense, slides on settle. */}
          {markerValue !== null && (
            <div
              className={`absolute -top-1 bottom-[-4px] flex flex-col items-center ${
                phase === "settled" ? "transition-[left] duration-700 ease-out" : ""
              }`}
              style={{
                left: `${markerValue}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className={`h-2 w-2 rotate-45 ${markerColor}`} />
              <div className={`w-0.5 flex-1 ${markerColor}`} />
            </div>
          )}
          {/* Big number in the middle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`text-5xl font-black tabular-nums transition-colors ${numberColor} ${
                phase === "rolling" ? "blur-[0.5px]" : ""
              }`}
              style={{
                textShadow:
                  phase === "settled" && last?.won
                    ? "0 0 20px rgba(0,231,1,0.45)"
                    : undefined,
              }}
            >
              {displayNumber !== null ? displayNumber.toFixed(2) : "00.00"}
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

      <Button
        onClick={roll}
        disabled={busy}
        className="w-full transition-transform active:scale-[0.98]"
      >
        {busy ? "Rolling…" : "Roll"}
      </Button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && !error && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-semibold transition-all ${
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
