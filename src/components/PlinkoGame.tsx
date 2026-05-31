"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { multiplierTable, ROWS, Risk } from "@/lib/games/plinko";

/**
 * Plinko with real per-frame physics. Each ball is a body with position
 * and velocity. Gravity pulls it down; when it intersects its "next"
 * peg, we apply a deflection impulse in the direction the server told
 * us (the path bit). Side walls bounce. After the last peg row, the
 * ball settles into its target slot with a short squish-bounce.
 *
 * Layout: row r (0..ROWS-1) has (r+1) pegs centered. Bottom row has
 * ROWS pegs, giving ROWS+1 slots at the floor.
 */

// World units (SVG viewBox coords). 320 wide / 380 tall fits 16 peg rows.
const W = 320;
const H = 400;
const TOP_PAD = 16;
const PEG_SPACING_X = W / (ROWS + 2);            // horizontal peg spacing
const PEG_SPACING_Y = PEG_SPACING_X * 1.05;      // vertical between rows
const PEG_R = 1.8;
const BALL_R = 4.2;
const GRAVITY = 520;                             // units / s^2 — tuned so a full fall takes ~3s
const SIDE_DAMP = 0.55;                          // wall bounce damp
// Peg deflect vx tuned so the ball lands close to the next row's peg:
// rows are PEG_SPACING_X / 2 apart, time-between-rows ≈ 0.2s, so target
// horizontal travel ≈ PEG_SPACING_X / 2 / 0.2 = ~44 units/s.
const PEG_DEFLECT_VX = 42;
const PEG_VY_KEEP = 0.45;                        // fraction of downward vy retained after peg hit (no reversal)
const PEG_VY_MIN = 25;                           // floor on post-peg downward vy so ball keeps moving
const SPAWN_VY = 40;                             // initial downward speed (so ball moves immediately)
const SLOT_FLOOR_Y = TOP_PAD + (ROWS + 1) * PEG_SPACING_Y + 6;
const SETTLE_VY = 6;                             // when |vy| drops below this near floor, settle

const RISK_LABELS: Record<Risk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

type Ball = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  path: boolean[];      // L (false) / R (true) per row, from server
  nextRow: number;      // 0..ROWS, the next peg row the ball still needs to deflect off
  slot: number;         // 0..ROWS (final landing slot)
  settledAtMs: number | null;
  multiplier: number;
  betCents: number;
};

function pegPos(row: number, col: number): { x: number; y: number } {
  // row 0 has 1 peg, row r has r+1 pegs
  return {
    x: W / 2 + (col - row / 2) * PEG_SPACING_X,
    y: TOP_PAD + (row + 1) * PEG_SPACING_Y,
  };
}

function slotCenterX(slot: number): number {
  // 17 slots (0..ROWS) sit under the 16-peg last row. Slot k = R rights
  // means the ball ended at peg col=R after R rights and (ROWS-R) lefts;
  // with one extra L/R final deflection, slot k lands between pegs
  // (k-1) and k. Centered formula: slot ROWS/2 is dead center.
  return W / 2 + (slot - ROWS / 2) * PEG_SPACING_X;
}

export function PlinkoGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [risk, setRisk] = useState<Risk>("medium");
  const [error, setError] = useState<string | null>(null);
  const [lastBank, setLastBank] = useState<{
    multiplier: number;
    slot: number;
    payoutCents: number;
    betCents: number;
  } | null>(null);

  // Mutable simulation state. We don't put balls in setState — they
  // update per-frame and we trigger a render with a tick counter.
  const ballsRef = useRef<Ball[]>([]);
  const slotFlashRef = useRef<Map<number, number>>(new Map());
  const idRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const [, setTick] = useState(0);

  // Pessimistic in-flight bet total so the player can rapid-fire balls
  // before the server's balance_update has come back. Decremented when
  // a drop resolves (so the budget gets returned, then the server's
  // balance_update arrives a beat later with the real number).
  const inFlightCentsRef = useRef(0);

  const table = multiplierTable(risk);

  // Per-frame physics loop. Runs always; cheap when no balls in flight.
  // Uses fixed-timestep substepping (1/120s steps) so the simulation stays
  // accurate even if RAF throttles in background tabs.
  useEffect(() => {
    let raf = 0;
    const STEP = 1 / 120; // physics substep (s)
    const STEP_MS = STEP * 1000;
    const MAX_FRAME_MS = 1500; // catch up at most 1.5s of real time per frame
    const SNAP_AFTER_MS = 4000; // if frame gap exceeds this, snap ball to slot

    function stepOnce(t: number) {
      const balls = ballsRef.current;
      for (const b of balls) {
        if (b.settledAtMs !== null) continue;
        // Integrate
        b.vy += GRAVITY * STEP;
        b.x += b.vx * STEP;
        b.y += b.vy * STEP;
        // Slight air drag on horizontal velocity
        b.vx *= Math.pow(0.9, STEP);

        // Side walls
        if (b.x < BALL_R) {
          b.x = BALL_R;
          b.vx = Math.abs(b.vx) * SIDE_DAMP;
        }
        if (b.x > W - BALL_R) {
          b.x = W - BALL_R;
          b.vx = -Math.abs(b.vx) * SIDE_DAMP;
        }

        // Try to collide with the next peg the ball is destined for
        if (b.nextRow < ROWS) {
          const rightsSoFar = b.path
            .slice(0, b.nextRow)
            .filter(Boolean).length;
          const peg = pegPos(b.nextRow, rightsSoFar);
          const dx = b.x - peg.x;
          const dy = b.y - peg.y;
          const distSq = dx * dx + dy * dy;
          const r = BALL_R + PEG_R;
          const goRight = b.path[b.nextRow];
          const dir = goRight ? 1 : -1;
          const hit = distSq < r * r && b.y > peg.y - r * 0.8;
          // Safety net: if the ball has already passed this peg's row
          // without colliding (numerical miss because vx pushed it past
          // the lateral capture window), force the deflection anyway.
          // Otherwise the ball is stuck looking for a peg it can never
          // reach and falls forever past the floor.
          const passed = b.y > peg.y + r * 1.2;
          if (hit || passed) {
            b.x = peg.x + dir * r * 0.95;
            b.y = peg.y + r * 0.4;
            b.vx = dir * PEG_DEFLECT_VX + (Math.random() - 0.5) * 8;
            // Preserve downward momentum — peg deflects sideways, doesn't bounce
            // the ball back up. Use the larger of "fraction of incoming vy"
            // and a minimum, so the ball never stalls.
            b.vy = Math.max(Math.abs(b.vy) * PEG_VY_KEEP, PEG_VY_MIN);
            b.nextRow++;
          }
        }

        // After the last peg, gravitate toward the target slot
        if (b.nextRow >= ROWS) {
          const targetX = slotCenterX(b.slot);
          b.vx += (targetX - b.x) * 6 * STEP;
          // Floor + settle
          if (b.y >= SLOT_FLOOR_Y - BALL_R) {
            b.y = SLOT_FLOOR_Y - BALL_R;
            b.vy = -Math.abs(b.vy) * 0.35; // bounce
            b.vx *= 0.5;
            if (Math.abs(b.vy) < SETTLE_VY && Math.abs(b.vx) < SETTLE_VY) {
              b.settledAtMs = t;
              b.x = targetX;
              slotFlashRef.current.set(b.slot, t);
            }
          }
        }
      }
    }

    const loop = (t: number) => {
      const last = lastTimeRef.current ?? t;
      // Catch up at most MAX_FRAME_MS — after that, just snap the ball
      // home (handles tab returning from background after a long pause).
      const realDt = t - last;
      lastTimeRef.current = t;
      const frameMs = Math.min(MAX_FRAME_MS, realDt);
      let acc = frameMs;
      while (acc > 0) {
        stepOnce(t);
        acc -= STEP_MS;
      }

      // If the frame gap is huge (e.g. user backgrounded the tab for
      // several seconds), snap any in-flight balls straight to their
      // target slot so they don't linger off-screen.
      if (realDt > SNAP_AFTER_MS) {
        for (const b of ballsRef.current) {
          if (b.settledAtMs === null) {
            b.x = slotCenterX(b.slot);
            b.y = SLOT_FLOOR_Y - BALL_R;
            b.vx = 0;
            b.vy = 0;
            b.nextRow = ROWS;
            b.settledAtMs = t;
            slotFlashRef.current.set(b.slot, t);
          }
        }
      }

      // Drop balls that have been settled for > 1.2s
      const before = ballsRef.current.length;
      ballsRef.current = ballsRef.current.filter(
        (b) => b.settledAtMs === null || t - b.settledAtMs < 1200
      );
      // Drop expired slot flashes
      const flash = slotFlashRef.current;
      for (const [k, v] of flash) if (t - v > 900) flash.delete(k);

      // Force re-render only when something is animating
      if (ballsRef.current.length > 0 || flash.size > 0 || before > 0) {
        setTick((n) => (n + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const drop = useCallback(async (): Promise<boolean> => {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Min bet $${(MIN_BET_CENTS / 100).toFixed(2)}`);
      return false;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet $${(MAX_BET_CENTS / 100).toFixed(0)}`);
      return false;
    }
    // Pessimistic balance check accounting for in-flight bets so a
    // rapid-fire player can't oversubscribe their balance and only
    // discover it when the server rejects.
    if (betCents + inFlightCentsRef.current > balanceCents) {
      setError("Insufficient balance");
      return false;
    }
    setError(null);
    inFlightCentsRef.current += betCents;
    let res: Response;
    try {
      res = await fetch("/api/games/plinko/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId, betCents, risk }),
      });
    } catch (e) {
      inFlightCentsRef.current -= betCents;
      setError("network error");
      return false;
    }
    inFlightCentsRef.current -= betCents;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "drop failed");
      return false;
    }
    const data = (await res.json()) as {
      path: boolean[];
      slot: number;
      multiplier: number;
      payoutCents: number;
    };
    // Spawn the ball at top center with small random horizontal jitter
    const id = ++idRef.current;
    ballsRef.current.push({
      id,
      x: W / 2 + (Math.random() - 0.5) * 1.5,
      y: 0,
      vx: (Math.random() - 0.5) * 4,
      vy: SPAWN_VY,
      path: data.path,
      nextRow: 0,
      slot: data.slot,
      settledAtMs: null,
      multiplier: data.multiplier,
      betCents,
    });
    setLastBank({
      multiplier: data.multiplier,
      slot: data.slot,
      payoutCents: data.payoutCents,
      betCents,
    });
    return true;
  }, [betDollars, risk, lobbyId, balanceCents]);

  // Color for slot multiplier
  function slotColor(m: number) {
    if (m >= 10) return { bg: "#00E701", text: "#0F212E" };
    if (m >= 2) return { bg: "#FFB800", text: "#0F212E" };
    if (m >= 1) return { bg: "#1A2C38", text: "#B1BAD3" };
    return { bg: "#0F212E", text: "#7B8BA8" };
  }

  // Render pegs and current balls
  const balls = ballsRef.current;
  const flash = slotFlashRef.current;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🎯 Plinko</h2>
        <div className="flex gap-1">
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRisk(r)}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                risk === r ? "bg-accent text-bg" : "bg-bg text-muted hover:text-white"
              }`}
            >
              {RISK_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md bg-bg p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ aspectRatio: `${W}/${H}` }}
        >
          {/* Pegs */}
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: r + 1 }, (_, c) => {
              const p = pegPos(r, c);
              return (
                <circle
                  key={`p-${r}-${c}`}
                  cx={p.x}
                  cy={p.y}
                  r={PEG_R}
                  fill="#243846"
                />
              );
            })
          )}

          {/* Slot floor markers */}
          {table.map((m, slot) => {
            const x = slotCenterX(slot);
            const c = slotColor(m);
            const isLit = flash.has(slot);
            return (
              <g key={`slot-${slot}`}>
                <rect
                  x={x - PEG_SPACING_X * 0.45}
                  y={SLOT_FLOOR_Y}
                  width={PEG_SPACING_X * 0.9}
                  height={14}
                  rx={3}
                  fill={c.bg}
                  opacity={isLit ? 1 : 0.75}
                  style={{
                    transition: "opacity 200ms",
                    filter: isLit ? "drop-shadow(0 0 5px rgba(255,255,255,0.7))" : undefined,
                  }}
                />
                <text
                  x={x}
                  y={SLOT_FLOOR_Y + 10}
                  textAnchor="middle"
                  fontSize={6}
                  fontWeight="bold"
                  fill={c.text}
                >
                  {m}
                </text>
              </g>
            );
          })}

          {/* Balls */}
          {balls.map((b) => {
            const settled = b.settledAtMs !== null;
            return (
              <g key={b.id}>
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={BALL_R}
                  fill={settled ? "#FFB800" : "#FFB800"}
                  stroke="#0F212E"
                  strokeWidth={0.4}
                  opacity={settled ? Math.max(0, 1 - (performance.now() - b.settledAtMs!) / 1000) : 1}
                />
                {/* Slight inner highlight */}
                <circle
                  cx={b.x - BALL_R * 0.35}
                  cy={b.y - BALL_R * 0.35}
                  r={BALL_R * 0.35}
                  fill="rgba(255,255,255,0.4)"
                  opacity={settled ? 0 : 1}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Bet</span>
          <span className="text-[10px]">
            Max{" "}
            <span className="tabular-nums text-secondary">
              ${(MAX_BET_CENTS / 100).toFixed(0)}
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
            type="number"
            min={MIN_BET_CENTS / 100}
            max={MAX_BET_CENTS / 100}
            step="0.50"
            value={betDollars}
            onChange={(e) => setBetDollars(e.target.value)}
          />
          <button
            type="button"
            onClick={() =>
              setBetDollars(
                (Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2)
              )
            }
            className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand transition hover:bg-brand/25 active:scale-95"
          >
            Max
          </button>
        </div>
      </div>

      <Button
        onClick={drop}
        className="w-full transition-transform active:scale-[0.98]"
      >
        Drop Ball{balls.length > 0 ? ` (${balls.length})` : ""}
      </Button>
      <AutoBet onPlay={drop} pauseMs={100} />

      {error && <p className="text-sm text-red-400">{error}</p>}
      {lastBank && !error && (
        <div
          className={`rounded-md px-3 py-2 text-center text-sm font-semibold ${
            lastBank.payoutCents >= lastBank.betCents
              ? "bg-accent/10 text-accent"
              : "bg-red-500/10 text-red-300"
          }`}
        >
          Slot multi {lastBank.multiplier}x ·{" "}
          {lastBank.payoutCents >= lastBank.betCents ? "+" : ""}$
          {((lastBank.payoutCents - lastBank.betCents) / 100).toFixed(2)}
        </div>
      )}
    </div>
  );
}
