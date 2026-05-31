"use client";
import { useRef, useState } from "react";
import { Button } from "./Button";
import { WinBurst } from "./WinBurst";
import { AutoBet } from "./AutoBet";
import { MAX_BET_CENTS } from "@/lib/games/limits";
import { Bet, colorOf } from "@/lib/games/roulette";

type ChipBet = { bet: Bet; amountCents: number };

// European roulette wheel order (clockwise from 0)
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const SLOT_DEG = 360 / WHEEL_ORDER.length;
const SPIN_DURATION_MS = 3200;

function colorHex(c: "red" | "black" | "green") {
  return c === "red" ? "#DC2626" : c === "green" ? "#00E701" : "#0F212E";
}

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

  // Spinning state — wheel rotates one way, ball orbits the other for drama
  const [wheelRotation, setWheelRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const spinIdRef = useRef(0);

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

  async function spin(): Promise<boolean> {
    if (bets.length === 0 || totalCents > MAX_BET_CENTS || totalCents > balanceCents) {
      setError(
        totalCents > balanceCents
          ? "Insufficient balance"
          : totalCents > MAX_BET_CENTS
            ? `Max total $${MAX_BET_CENTS / 100}`
            : "Place a bet first"
      );
      return false;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setSpinning(true);
    const thisSpinId = ++spinIdRef.current;

    const res = await fetch("/api/games/roulette/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, bets }),
    });
    if (!res.ok) {
      setSpinning(false);
      setBusy(false);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "spin failed");
      return false;
    }
    const data = (await res.json()) as {
      n: number;
      color: "red" | "black" | "green";
      totalPayout: number;
    };

    // Position the winning number under the pointer at the top.
    // Wheel spins clockwise (positive), ball orbits counter-clockwise.
    const slotIndex = WHEEL_ORDER.indexOf(data.n);
    // To land slot under pointer (top, 0 deg), wheel rotates by (-slotIndex * SLOT_DEG)
    // mod 360, plus several full turns for drama.
    const baseWheel = -slotIndex * SLOT_DEG;
    setWheelRotation((p) => p + 5 * 360 + (baseWheel - (p % 360)));
    // Ball spins faster in the opposite direction, then settles at top
    setBallRotation((p) => p - 8 * 360 - ((p % 360) + 360) % 360);

    // Wait for the spin animation to mostly finish before showing the result
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        // Only apply if this is still the most recent spin
        if (spinIdRef.current === thisSpinId) {
          setResult({ ...data, netDelta: data.totalPayout - totalCents });
          setSpinning(false);
          setBusy(false);
          setBets([]);
        }
        resolve();
      }, SPIN_DURATION_MS);
    });
    return true;
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

  // Wheel geometry for SVG render
  const W = 220;
  const cx = W / 2;
  const cy = W / 2;
  const rOuter = W / 2 - 4;
  const rInner = rOuter - 26;
  const ballR = 6;

  return (
    <div className="w-full max-w-md space-y-3 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">🎡 Roulette</h2>

      {/* Wheel + ball */}
      <div className="relative mx-auto" style={{ width: W, height: W }}>
        <WinBurst
          trigger={result && result.netDelta > 0 ? `${result.n}` : false}
          intensity={result && result.netDelta > result.totalPayout * 0.5 ? 1.6 : 1}
        />
        {/* Pointer at top */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "12px solid #FFB800",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
          }}
        />
        <svg
          viewBox={`0 0 ${W} ${W}`}
          className="absolute inset-0"
          style={{
            transform: `rotate(${wheelRotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.18, 0.85, 0.22, 1)`
              : undefined,
          }}
        >
          {WHEEL_ORDER.map((n, i) => {
            const a0 = (i - 0.5) * SLOT_DEG - 90;
            const a1 = (i + 0.5) * SLOT_DEG - 90;
            const rad0 = (a0 * Math.PI) / 180;
            const rad1 = (a1 * Math.PI) / 180;
            const p0o = { x: cx + rOuter * Math.cos(rad0), y: cy + rOuter * Math.sin(rad0) };
            const p1o = { x: cx + rOuter * Math.cos(rad1), y: cy + rOuter * Math.sin(rad1) };
            const p0i = { x: cx + rInner * Math.cos(rad0), y: cy + rInner * Math.sin(rad0) };
            const p1i = { x: cx + rInner * Math.cos(rad1), y: cy + rInner * Math.sin(rad1) };
            const d = [
              `M ${p0o.x} ${p0o.y}`,
              `A ${rOuter} ${rOuter} 0 0 1 ${p1o.x} ${p1o.y}`,
              `L ${p1i.x} ${p1i.y}`,
              `A ${rInner} ${rInner} 0 0 0 ${p0i.x} ${p0i.y}`,
              "Z",
            ].join(" ");
            const labelR = (rOuter + rInner) / 2;
            const labelA = i * SLOT_DEG - 90;
            const lx = cx + labelR * Math.cos((labelA * Math.PI) / 180);
            const ly = cy + labelR * Math.sin((labelA * Math.PI) / 180);
            return (
              <g key={i}>
                <path d={d} fill={colorHex(colorOf(n))} stroke="#0F212E" strokeWidth={0.4} />
                <text
                  x={lx}
                  y={ly}
                  fill="#ffffff"
                  fontSize={9}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${labelA + 90} ${lx} ${ly})`}
                >
                  {n}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={rInner - 4} fill="#0F212E" stroke="#FFB800" strokeWidth={1} />
        </svg>
        {/* Ball — orbits on its own transform */}
        <div
          className="absolute inset-0"
          style={{
            transform: `rotate(${ballRotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.7, 0.2, 1)`
              : undefined,
          }}
        >
          <div
            className="absolute rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
            style={{
              width: ballR * 2,
              height: ballR * 2,
              left: `calc(50% - ${ballR}px)`,
              top: 6,
            }}
          />
        </div>
      </div>

      {/* Spin result */}
      {result && !spinning && (
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
      <AutoBet onPlay={spin} pauseMs={400} />

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
