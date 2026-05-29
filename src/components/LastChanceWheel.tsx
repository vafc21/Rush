"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

const SEGMENTS = 50;
const SEGMENT_DEG = 360 / SEGMENTS;
const COOLDOWN_MS = 20_000;
const SPIN_MS = 3_500;

type SpinResult = {
  won: boolean;
  landedSegment: number;
  winningSegment: number;
  segments: number;
  rebuyCents: number;
};

export function LastChanceWheel({ lobbyId }: { lobbyId: string }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [last, setLast] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  // 1Hz tick for cooldown countdown
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const cooldownLeftMs =
    cooldownUntil !== null ? Math.max(0, cooldownUntil - nowMs) : 0;
  const onCooldown = cooldownLeftMs > 0;

  async function spin() {
    if (spinning || onCooldown) return;
    setSpinning(true);
    setError(null);
    setLast(null);

    const res = await fetch(`/api/lobbies/${lobbyId}/last-chance/spin`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "spin failed");
      setSpinning(false);
      return;
    }
    const result = (await res.json()) as SpinResult;

    // Rotate by 8 full turns plus the angle to bring the landed segment
    // under the pointer at the top. Segment 0 is at the top, going clockwise.
    const baseTurns = 8;
    const targetDeg =
      baseTurns * 360 + (360 - result.landedSegment * SEGMENT_DEG);
    setRotation((prev) => prev + targetDeg);

    setTimeout(() => {
      setSpinning(false);
      setLast(result);
      if (!result.won) {
        setCooldownUntil(Date.now() + COOLDOWN_MS);
      }
    }, SPIN_MS);
  }

  // Build segment paths
  const segments = Array.from({ length: SEGMENTS }, (_, i) => i);

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6 text-center">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted">
          Last Chance
        </p>
        <h2 className="text-xl font-black text-brand">Wheel</h2>
        <p className="mt-1 text-xs text-secondary">
          Land on gold for a $500 rebuy. 1 / {SEGMENTS} per spin.
        </p>
      </div>

      <div className="relative mx-auto h-64 w-64">
        {/* Pointer */}
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
        {/* Wheel */}
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
          {segments.map((i) => {
            const startAngle = i * SEGMENT_DEG - 90 - SEGMENT_DEG / 2;
            const endAngle = startAngle + SEGMENT_DEG;
            const start = polarToCartesian(0, 0, 48, startAngle);
            const end = polarToCartesian(0, 0, 48, endAngle);
            const largeArc = SEGMENT_DEG > 180 ? 1 : 0;
            const d = [
              `M 0 0`,
              `L ${start.x} ${start.y}`,
              `A 48 48 0 ${largeArc} 1 ${end.x} ${end.y}`,
              "Z",
            ].join(" ");
            const isWinner = i === 0;
            const fill = isWinner
              ? "#FFB800"
              : i % 2 === 0
                ? "#1A2C38"
                : "#243846";
            return (
              <path
                key={i}
                d={d}
                fill={fill}
                stroke="#0F212E"
                strokeWidth={0.3}
              />
            );
          })}
          {/* Center hub */}
          <circle r={8} fill="#0F212E" stroke="#FFB800" strokeWidth={1} />
        </svg>
      </div>

      <Button
        onClick={spin}
        disabled={spinning || onCooldown}
        className="w-full"
      >
        {spinning
          ? "Spinning…"
          : onCooldown
            ? `Cooldown ${Math.ceil(cooldownLeftMs / 1000)}s`
            : "Spin"}
      </Button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {last && !error && (
        <div
          className={`rounded-md px-3 py-3 text-center text-sm font-bold ${
            last.won
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          {last.won
            ? `You won! +$${(last.rebuyCents / 100).toFixed(2)} — back in the game.`
            : "No luck. Try again in 20s."}
        </div>
      )}
    </div>
  );
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}
