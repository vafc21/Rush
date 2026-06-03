"use client";
import { pts as fmtPts } from "@/lib/format";

/**
 * A live sparkline of the player's own balance over the current round —
 * the end-of-round graph distilled to just you. Green when in profit, red
 * when down, with a dashed baseline at the starting balance.
 */
export function SelfTrendGraph({
  points,
  baselineCents,
}: {
  points: number[];
  baselineCents: number;
}) {
  const W = 100;
  const Hh = 40;

  const data = points.length > 0 ? points : [baselineCents];
  const current = data[data.length - 1];
  const pl = current - baselineCents;
  const up = pl >= 0;
  const color = up ? "#00E701" : "#F87171"; // accent green / loss red

  const lo = Math.min(baselineCents, ...data);
  const hi = Math.max(baselineCents, ...data);
  const pad = Math.max(1, (hi - lo) * 0.12);
  const yMin = lo - pad;
  const span = Math.max(1, hi + pad - yMin);

  const x = (i: number) => (data.length === 1 ? 0 : (i / (data.length - 1)) * W);
  const y = (v: number) => Hh - ((v - yMin) / span) * Hh;
  const yBase = y(baselineCents);

  const linePts = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPts = `0,${Hh} ${linePts} ${x(data.length - 1)},${Hh}`;

  return (
    <div className="space-y-2 rounded-lg bg-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Your run
        </p>
        <span
          className={`text-xs font-bold tabular-nums ${
            up ? "text-accent" : "text-red-400"
          }`}
        >
          {up ? "+" : "−"}
          {fmtPts(Math.abs(pl))} pts
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${Hh}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
      >
        <defs>
          <linearGradient id="self-trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Baseline (starting balance) */}
        <line
          x1={0}
          x2={W}
          y1={yBase}
          y2={yBase}
          stroke="#7B8BA8"
          strokeWidth={0.5}
          strokeDasharray="3 3"
          opacity={0.5}
        />
        <polygon points={areaPts} fill="url(#self-trend-fill)" />
        <polyline
          points={linePts}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <p className="text-center text-[10px] tabular-nums text-muted">
        {fmtPts(current)} pts · baseline {fmtPts(baselineCents)}
      </p>
    </div>
  );
}
