"use client";
import { useState, type CSSProperties } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { tableFor, Difficulty, DIFFICULTIES, Tier } from "@/lib/games/crateRun";
import { pts } from "@/lib/format";

const RUN_MS = 1100; // runner dashes to the crate
const BURST_MS = 700; // crate bursts open into the tier color

type Result = {
  tier: Tier;
  color: string;
  hex: string;
  multiplier: number;
  payoutCents: number;
};

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "easy",
  normal: "normal",
  hard: "hard",
};

export function CrateRunGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [running, setRunning] = useState(false);
  const [burst, setBurst] = useState<Result | null>(null); // shown mid-burst
  const [last, setLast] = useState<(Result & { betCents: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const table = tableFor(difficulty);

  async function play(): Promise<boolean> {
    if (running) return false;
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
    setRunning(true);
    setError(null);
    setLast(null);
    setBurst(null);

    // Kick off the runner's dash and the server roll together.
    const dash = new Promise<void>((r) => setTimeout(r, RUN_MS));
    const res = await fetch("/api/games/crate-run/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, difficulty }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "run failed");
      setRunning(false);
      return false;
    }
    const data = (await res.json()) as Result;

    await dash; // wait for the runner to reach the crate
    setBurst(data); // crate bursts into the rolled color
    await new Promise<void>((r) => setTimeout(r, BURST_MS));
    setBurst(null);
    setLast({ ...data, betCents });
    setRunning(false);
    return true;
  }

  const won = last ? last.multiplier >= 1 : false;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📦 Crate Run</h2>
        <div className="flex gap-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              disabled={running}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold capitalize transition ${
                difficulty === d
                  ? "bg-accent text-bg"
                  : "bg-bg text-muted hover:text-white"
              }`}
            >
              {DIFF_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Sidescroller stage: runner dashes to the crate, crate bursts open. */}
      <div className="relative h-44 overflow-hidden rounded-md bg-gradient-to-b from-[#16242F] to-[#0F212E] ring-1 ring-white/5">
        {/* parallax hills */}
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-around opacity-20">
          {["⛰️", "🌲", "⛰️", "🌲", "⛰️"].map((e, i) => (
            <span key={i} className="text-3xl">
              {e}
            </span>
          ))}
        </div>
        {/* ground */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-[#0A1922]" />
        <div className="absolute inset-x-0 bottom-8 h-px bg-white/10" />

        {/* runner */}
        <div
          className="absolute bottom-8 text-3xl"
          style={{
            left: running || burst || last ? "calc(100% - 6.5rem)" : "0.5rem",
            transition: `left ${RUN_MS}ms cubic-bezier(0.45,0.05,0.55,0.95)`,
          }}
        >
          {burst ? "🧍" : "🏃"}
        </div>

        {/* crate / burst */}
        <div className="absolute bottom-8 right-6 flex flex-col items-center">
          {burst ? (
            <div className="relative flex h-16 w-16 items-center justify-center">
              {/* radial burst particles in the rolled color */}
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute h-2 w-2 rounded-full"
                  style={
                    {
                      background: burst.hex,
                      "--ang": `${i * 45}deg`,
                      animation: "rush-crate-spark 700ms ease-out forwards",
                    } as CSSProperties
                  }
                />
              ))}
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-xs font-black tabular-nums shadow-lg"
                style={{
                  background: burst.hex,
                  color: "#0A1922",
                  boxShadow: `0 0 24px 4px ${burst.hex}`,
                  animation: "rush-pop 300ms ease-out",
                }}
              >
                {burst.multiplier}x
              </div>
            </div>
          ) : (
            <div
              className="text-4xl"
              style={{
                transition: "transform 120ms",
                transform: running ? "translateY(-2px) rotate(-4deg)" : "none",
              }}
            >
              📦
            </div>
          )}
        </div>

        {/* result label overlaid */}
        {last && !running && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
            <span
              className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide"
              style={{ background: last.hex, color: "#0A1922" }}
            >
              {last.color} · {last.multiplier}x
            </span>
          </div>
        )}
      </div>

      {/* rarity ladder for the selected difficulty */}
      <div className="flex flex-wrap justify-center gap-1 text-[10px]">
        {table.map((t) => (
          <span
            key={t.tier}
            className="rounded px-1.5 py-0.5 font-bold tabular-nums"
            style={{ background: t.hex, color: "#0A1922" }}
            title={`${t.color} · ${(t.probability * 100).toFixed(
              t.probability < 0.01 ? 3 : 1
            )}%`}
          >
            {t.multiplier}x
          </span>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Bet</span>
          <span className="text-[10px]">Max {pts(MAX_BET_CENTS)} pts</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
            type="number"
            min={MIN_BET_CENTS / 100}
            max={MAX_BET_CENTS / 100}
            step="0.50"
            value={betDollars}
            disabled={running}
            onChange={(e) => setBetDollars(e.target.value)}
          />
          <button
            onClick={() =>
              setBetDollars((Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2))
            }
            disabled={running}
            className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand hover:bg-brand/25 active:scale-95 disabled:opacity-50"
          >
            Max
          </button>
        </div>
      </div>
      <Button onClick={play} disabled={running} className="w-full">
        {running ? "Running…" : "Open Crate"}
      </Button>
      <AutoBet onPlay={play} pauseMs={400} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && !running && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
            won ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-300"
          }`}
        >
          {last.color} crate · {last.payoutCents >= last.betCents ? "+" : ""}
          {pts(last.payoutCents - last.betCents)} pts
        </div>
      )}
    </div>
  );
}
