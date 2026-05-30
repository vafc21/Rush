"use client";
import { useState } from "react";
import { Button } from "./Button";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { segmentsFor, SEGMENTS, Risk } from "@/lib/games/wheel";

const SPIN_MS = 3000;
const SEG_DEG = 360 / SEGMENTS;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function WheelGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [risk, setRisk] = useState<Risk>("medium");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{
    segment: number;
    multiplier: number;
    payoutCents: number;
    betCents: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const segs = segmentsFor(risk);

  async function play() {
    if (spinning) return;
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
    setSpinning(true);
    setError(null);
    setLast(null);
    const res = await fetch("/api/games/wheel/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, risk }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "spin failed");
      setSpinning(false);
      return;
    }
    const data = (await res.json()) as {
      segment: number;
      multiplier: number;
      payoutCents: number;
    };
    const targetDeg = 8 * 360 + (360 - data.segment * SEG_DEG);
    setRotation((p) => p + targetDeg);
    setTimeout(() => {
      setSpinning(false);
      setLast({ ...data, betCents });
    }, SPIN_MS);
  }

  function color(m: number) {
    if (m === 0) return "#1A2C38";
    if (m >= 5) return "#FFB800";
    if (m >= 2) return "#00E701";
    return "#243846";
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🎯 Wheel</h2>
        <div className="flex gap-1">
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRisk(r)}
              disabled={spinning}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                risk === r ? "bg-accent text-bg" : "bg-bg text-muted hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto h-64 w-64">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
          <div
            className="h-0 w-0"
            style={{
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "16px solid #FFB800",
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
            }}
          />
        </div>
        <svg
          viewBox="-50 -50 100 100"
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.25, 1)`
              : undefined,
          }}
        >
          {segs.map((m, i) => {
            const start = i * SEG_DEG - 90 - SEG_DEG / 2;
            const end = start + SEG_DEG;
            const s = polar(0, 0, 48, start);
            const e = polar(0, 0, 48, end);
            const d = [
              `M 0 0`,
              `L ${s.x} ${s.y}`,
              `A 48 48 0 0 1 ${e.x} ${e.y}`,
              "Z",
            ].join(" ");
            return <path key={i} d={d} fill={color(m)} stroke="#0F212E" strokeWidth={0.3} />;
          })}
          <circle r={8} fill="#0F212E" stroke="#FFB800" strokeWidth={1} />
        </svg>
      </div>

      <div className="flex flex-wrap justify-center gap-1 text-[10px]">
        {[...new Set(segs)].sort((a, b) => a - b).map((m) => (
          <span
            key={m}
            className="rounded px-2 py-0.5 tabular-nums font-bold"
            style={{ background: color(m), color: m === 0 ? "#7B8BA8" : "#0F212E" }}
          >
            {m}x
          </span>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Bet</span>
          <span className="text-[10px]">Max ${(MAX_BET_CENTS / 100).toFixed(0)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
            type="number"
            min={MIN_BET_CENTS / 100}
            max={MAX_BET_CENTS / 100}
            step="0.50"
            value={betDollars}
            disabled={spinning}
            onChange={(e) => setBetDollars(e.target.value)}
          />
          <button
            onClick={() =>
              setBetDollars((Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2))
            }
            disabled={spinning}
            className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand hover:bg-brand/25 active:scale-95 disabled:opacity-50"
          >
            Max
          </button>
        </div>
      </div>
      <Button onClick={play} disabled={spinning} className="w-full">
        {spinning ? "Spinning…" : "Spin"}
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && !spinning && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
            last.multiplier >= 1 ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-300"
          }`}
        >
          Landed on {last.multiplier}x ·{" "}
          {last.payoutCents >= last.betCents ? "+" : ""}$
          {((last.payoutCents - last.betCents) / 100).toFixed(2)}
        </div>
      )}
    </div>
  );
}
