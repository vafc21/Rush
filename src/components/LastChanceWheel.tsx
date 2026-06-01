"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { pts } from "@/lib/format";

const SEGMENTS = 50;
const SEGMENT_DEG = 360 / SEGMENTS;
const COOLDOWN_MS = 20_000;
const SPIN_MS = 3_500;
const WIN_LINGER_MS = 2_400; // let the player admire the landing before leaving

type SpinResult = {
  won: boolean;
  landedSegment: number;
  winningSegment: number;
  segments: number;
  rebuyCents: number;
};

export function LastChanceWheel({
  lobbyId,
  onBanked,
  onHold,
}: {
  lobbyId: string;
  onBanked?: (newBalanceCents: number) => void;
  onHold?: (held: boolean) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [last, setLast] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;

  // 1Hz tick for cooldown countdown
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Release any outstanding hold if we unmount mid-reveal.
  useEffect(() => () => onHoldRef.current?.(false), []);

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

    // A win clears the busted flag server-side (and broadcasts it), which
    // would otherwise yank this whole component out from under the player
    // mid-spin. Ask the parent to keep us mounted until the reveal is done.
    if (result.won) {
      onHold?.(true);
    }

    // Rotate by 8 full turns plus the offset that brings the landed segment
    // under the top pointer. Segment 0 (gold) sits at the top, segments
    // increase clockwise — so landing on 0 leaves the pointer on gold.
    const baseTurns = 8;
    const targetDeg =
      baseTurns * 360 + (360 - result.landedSegment * SEGMENT_DEG);
    setRotation((prev) => prev + targetDeg);

    setTimeout(() => {
      setSpinning(false);
      setLast(result);
      if (result.won) {
        onBanked?.(result.rebuyCents);
        // Hold a beat on the winning result, then hand control back to the
        // main games (the player is no longer busted).
        setTimeout(() => onHold?.(false), WIN_LINGER_MS);
      } else {
        setCooldownUntil(Date.now() + COOLDOWN_MS);
      }
    }, SPIN_MS);
  }

  // Build segment paths
  const segments = Array.from({ length: SEGMENTS }, (_, i) => i);

  return (
    <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/5 bg-gradient-to-b from-panel to-bg p-6 text-center shadow-xl">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">
          Last Chance
        </p>
        <h2 className="text-2xl font-black tracking-tight text-brand drop-shadow-[0_0_10px_rgba(255,184,0,0.35)]">
          🎡 Wheel
        </h2>
        <p className="mt-1 text-xs text-secondary">
          Land on gold for a 500 pts rebuy. 1 / {SEGMENTS} per spin.
        </p>
      </div>

      <div className="relative mx-auto h-64 w-64">
        {/* Pointer */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
          <div
            className="h-0 w-0"
            style={{
              borderLeft: "11px solid transparent",
              borderRight: "11px solid transparent",
              borderTop: "18px solid #FFB800",
              filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))",
            }}
          />
        </div>
        {/* Outer glow ring */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 30px rgba(255,184,0,0.18), inset 0 0 0 4px rgba(255,184,0,0.12)" }}
        />
        {/* Wheel */}
        <svg
          viewBox="-50 -50 100 100"
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.25, 1)`
              : undefined,
            filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.45))",
          }}
        >
          {segments.map((i) => {
            // Center segment i at angle (i * SEGMENT_DEG) clockwise from the
            // top. polarToCartesian already offsets 0° to the top, so segment
            // 0 sits under the pointer.
            const startAngle = i * SEGMENT_DEG - SEGMENT_DEG / 2;
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
          {/* Outer rim */}
          <circle r={48} fill="none" stroke="#FFB800" strokeWidth={1} opacity={0.5} />
          {/* Center hub */}
          <circle r={9} fill="#0F212E" stroke="#FFB800" strokeWidth={1.5} />
          <circle r={3} fill="#FFB800" />
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
          className={`rounded-lg px-3 py-3 text-center text-sm font-bold ring-1 ${
            last.won
              ? "bg-accent/10 text-accent ring-accent/20"
              : "bg-red-500/10 text-red-300 ring-red-500/20"
          }`}
        >
          {last.won
            ? `🎉 You won! +${pts(last.rebuyCents)} pts — back in the game.`
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
