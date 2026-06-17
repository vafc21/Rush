"use client";
import { useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { tableFor, Difficulty, DIFFICULTIES, Tier, TierConfig } from "@/lib/games/crateRun";
import { pts } from "@/lib/format";

// CS:GO / CSGORoll-style case-opening bar. The strip of rarity blocks
// slides right-to-left, fast then ease-out, landing the winning block under
// a fixed center selector. Tile geometry must stay in sync so the final
// offset lands the winner dead-center.
const TILE_W = 64; // px, a single rarity block
const TILE_GAP = 8; // px, flex gap between blocks
const PITCH = TILE_W + TILE_GAP; // distance between block centers
const STRIP_LEN = 56; // blocks filling the spinning strip
const WIN_IDX = 48; // the winning block sits here (8 blocks of runway after)
const SPIN_MS = 3800; // total spin time
const SPIN_EASE = "cubic-bezier(0.06, 0.72, 0.12, 1)"; // fast start, long ease-out

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

const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Weighted pick from the difficulty table (UI flavor only). */
function pickWeighted(table: TierConfig[]): TierConfig {
  const r = Math.random();
  let cursor = 0;
  for (const t of table) {
    cursor += t.probability;
    if (r < cursor) return t;
  }
  return table[table.length - 1];
}

/** A long strip of weighted blocks with the winner pinned at WIN_IDX. */
function buildStrip(table: TierConfig[], winner: TierConfig): TierConfig[] {
  const strip: TierConfig[] = [];
  for (let i = 0; i < STRIP_LEN; i++) {
    strip.push(i === WIN_IDX ? winner : pickWeighted(table));
  }
  return strip;
}

function Block({
  t,
  win,
}: {
  t: TierConfig;
  win: boolean;
}) {
  return (
    <div
      className="flex flex-shrink-0 flex-col items-center justify-center rounded-md transition-shadow"
      style={{
        width: TILE_W,
        height: 64,
        background: `linear-gradient(180deg, ${t.hex}22 0%, #0A1922 70%)`,
        borderTop: `2px solid ${t.hex}`,
        borderBottom: `4px solid ${t.hex}`,
        boxShadow: win ? `0 0 22px 3px ${t.hex}, inset 0 0 18px ${t.hex}55` : "none",
        animation: win ? "rush-crate-win 700ms ease-out" : undefined,
      }}
    >
      <span
        className="text-sm font-black tabular-nums"
        style={{ color: t.hex }}
      >
        {t.multiplier}x
      </span>
    </div>
  );
}

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
  const [last, setLast] = useState<(Result & { betCents: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Spin animation state.
  const [spinStrip, setSpinStrip] = useState<TierConfig[] | null>(null);
  const [offset, setOffset] = useState(0); // translateX px
  const [transMs, setTransMs] = useState(0); // transition duration
  const [revealed, setRevealed] = useState(false); // glow the winner on stop
  const barRef = useRef<HTMLDivElement>(null);

  const table = tableFor(difficulty);

  // Deterministic idle strip (no Math.random → no hydration mismatch).
  const idleStrip = useMemo(
    () => Array.from({ length: STRIP_LEN }, (_, i) => table[i % table.length]),
    [table]
  );
  const strip = spinStrip ?? idleStrip;

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
    setRevealed(false);

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

    // The server already decided the tier — the spin is purely a reveal.
    const winner =
      table.find((t) => t.tier === data.tier) ?? table[table.length - 1];
    const strip = buildStrip(table, winner);

    // Land the winning block under the center selector, with a touch of
    // jitter so it doesn't always stop pixel-perfect dead center.
    const barW = barRef.current?.offsetWidth ?? 400;
    const center = barW / 2;
    const winCenter = WIN_IDX * PITCH + TILE_W / 2;
    const jitter = (Math.random() * 2 - 1) * (TILE_W / 2 - 8);
    const finalOffset = center - winCenter + jitter;

    // Snap the fresh strip to the start, paint it, then animate the slide.
    setSpinStrip(strip);
    setTransMs(0);
    setOffset(0);
    await nextFrame();
    await nextFrame();
    setTransMs(SPIN_MS);
    setOffset(finalOffset);

    await new Promise<void>((r) => setTimeout(r, SPIN_MS + 80));
    setRevealed(true);
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

      {/* Case-opening bar: a row of rarity blocks spins under a center
          selector and decelerates to rest on the winning block. */}
      <div
        ref={barRef}
        className="relative h-24 overflow-hidden rounded-md bg-gradient-to-b from-[#16242F] to-[#0F212E] ring-1 ring-white/5"
      >
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#0F212E] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#0F212E] to-transparent" />

        {/* center selector */}
        <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 z-20 -translate-x-1/2">
          <div className="h-full w-0.5 bg-accent shadow-[0_0_12px_2px_rgba(0,231,160,0.6)]" />
          <div className="absolute -top-px left-1/2 -translate-x-1/2 border-x-4 border-t-[6px] border-x-transparent border-t-accent" />
          <div className="absolute -bottom-px left-1/2 -translate-x-1/2 border-x-4 border-b-[6px] border-x-transparent border-b-accent" />
        </div>

        {/* spinning strip */}
        <div
          className="absolute left-0 top-1/2 flex"
          style={{
            gap: TILE_GAP,
            transform: `translate(${offset}px, -50%)`,
            transition: `transform ${transMs}ms ${SPIN_EASE}`,
          }}
        >
          {strip.map((t, i) => (
            <Block
              key={i}
              t={t}
              win={revealed && spinStrip !== null && i === WIN_IDX}
            />
          ))}
        </div>

        {/* result label overlaid */}
        {last && !running && (
          <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2 text-center">
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
        {running ? "Opening…" : "Open Crate"}
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
