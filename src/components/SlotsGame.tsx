"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { WinBurst } from "./WinBurst";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Symbol, SYMBOLS } from "@/lib/games/slots";

/**
 * 3-reel slot machine with proper deceleration. Each reel is a vertical
 * strip of random symbols that scrolls upward at high speed, decelerates
 * (cubic ease-out), and lands on a target symbol with a small bounce.
 * Reels stop staggered (left → middle → right) to build suspense.
 */

const SYMBOL_HEIGHT_PX = 86;
const STRIP_LEAD = 28;                       // random symbols above the target so spin is visible
const SPIN_DURATION_MS = [1100, 1700, 2400]; // per-reel, staggered
const SETTLE_OVERSHOOT_MS = 220;

function randomSymbol(): Symbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

type ReelState = {
  strip: Symbol[];        // target sits at index STRIP_LEAD
  offset: number;         // current translateY in px
  startedAt: number | null;
  duration: number;
  settled: boolean;
};

function defaultReel(target: Symbol): ReelState {
  const strip: Symbol[] = [];
  for (let i = 0; i < STRIP_LEAD; i++) strip.push(randomSymbol());
  strip.push(target);
  strip.push(randomSymbol());
  return { strip, offset: 0, startedAt: null, duration: 0, settled: true };
}

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
  const [last, setLast] = useState<{
    multiplier: number;
    payoutCents: number;
    betCents: number;
    reels: [Symbol, Symbol, Symbol];
  } | null>(null);
  const [reels, setReels] = useState<[ReelState, ReelState, ReelState]>([
    defaultReel("🍒"),
    defaultReel("🍋"),
    defaultReel("🔔"),
  ]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (t: number) => {
      let dirty = false;
      setReels((rs) => {
        const next = rs.map((r) => {
          if (r.settled) return r;
          if (r.startedAt === null) return { ...r, startedAt: t };
          const elapsed = t - r.startedAt;
          const targetOffset = STRIP_LEAD * SYMBOL_HEIGHT_PX;
          const total = r.duration;
          if (elapsed >= total + SETTLE_OVERSHOOT_MS) {
            return { ...r, offset: targetOffset, settled: true };
          }
          const t01 = Math.min(1, elapsed / total);
          const eased = 1 - Math.pow(1 - t01, 3.5);
          let offset = eased * targetOffset;
          if (elapsed > total) {
            const k = (elapsed - total) / SETTLE_OVERSHOOT_MS;
            offset = targetOffset + Math.sin(k * Math.PI) * 6 * (1 - k);
          }
          dirty = true;
          return { ...r, offset };
        }) as [ReelState, ReelState, ReelState];
        return dirty ? next : rs;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  async function spin(): Promise<boolean> {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Min bet $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return false;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet $${(MAX_BET_CENTS / 100).toFixed(0)}`);
      return false;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return false;
    }
    setBusy(true);
    setError(null);
    setLast(null);

    const res = await fetch("/api/games/slots/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "spin failed");
      setBusy(false);
      return false;
    }
    const data = (await res.json()) as {
      reels: [Symbol, Symbol, Symbol];
      multiplier: number;
      payoutCents: number;
    };

    const nowMs = performance.now();
    setReels(
      data.reels.map((target, i) => {
        const strip: Symbol[] = [];
        for (let k = 0; k < STRIP_LEAD; k++) strip.push(randomSymbol());
        strip.push(target);
        strip.push(randomSymbol());
        return {
          strip,
          offset: 0,
          startedAt: nowMs,
          duration: SPIN_DURATION_MS[i],
          settled: false,
        };
      }) as [ReelState, ReelState, ReelState]
    );

    await new Promise<void>((resolve) => {
      setTimeout(
        () => {
          setLast({
            multiplier: data.multiplier,
            payoutCents: data.payoutCents,
            betCents,
            reels: data.reels,
          });
          setBusy(false);
          resolve();
        },
        SPIN_DURATION_MS[2] + SETTLE_OVERSHOOT_MS + 60
      );
    });
    return true;
  }

  function reelHighlight(reel: ReelState, idx: number) {
    if (!last || !reel.settled || last.multiplier === 0) return "";
    const [a, b, c] = last.reels;
    const allMatch = a === b && b === c;
    const pairLeft = a === b && a !== c;
    const pairRight = b === c && a !== c;
    if (allMatch) return "ring-2 ring-accent shadow-[0_0_18px_rgba(0,231,1,0.35)]";
    if (pairLeft && (idx === 0 || idx === 1)) return "ring-1 ring-brand";
    if (pairRight && (idx === 1 || idx === 2)) return "ring-1 ring-brand";
    return "";
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">🎰 Slots</h2>

      <div className="relative grid grid-cols-3 gap-2">
        <WinBurst
          trigger={last && last.multiplier > 0 ? `${last.payoutCents}` : false}
          intensity={last && last.multiplier >= 15 ? 1.8 : 1.1}
        />
        {reels.map((reel, i) => (
          <div
            key={i}
            className={`relative overflow-hidden rounded-md bg-bg transition-all ${reelHighlight(reel, i)}`}
            style={{ height: SYMBOL_HEIGHT_PX }}
          >
            <div
              className="absolute left-0 right-0 top-0"
              style={{
                transform: `translateY(-${reel.offset}px)`,
                willChange: "transform",
              }}
            >
              {reel.strip.map((sym, j) => (
                <div
                  key={j}
                  className="flex items-center justify-center text-5xl"
                  style={{ height: SYMBOL_HEIGHT_PX }}
                >
                  {sym}
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-bg to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-bg to-transparent" />
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
      <AutoBet onPlay={spin} pauseMs={200} />

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
