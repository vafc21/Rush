"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatedAmount } from "./AnimatedAmount";

export type Seat = {
  id: string;
  nickname: string;
  balanceCents: number;
  isBusted: boolean;
  isBot?: boolean;
};

export function LeaderboardPanel({
  seats,
  selfId,
}: {
  seats: Seat[];
  selfId: string | null;
}) {
  const sorted = [...seats].sort((a, b) => b.balanceCents - a.balanceCents);

  // Track per-player last seen balance so we can flash the row when it
  // changes. The flash is a short-lived style we strip after ~700ms.
  const previousRef = useRef<Map<string, number>>(new Map());
  const [flashing, setFlashing] = useState<Map<string, "up" | "down">>(
    new Map()
  );

  useEffect(() => {
    const prev = previousRef.current;
    const nextFlashes: Array<[string, "up" | "down"]> = [];
    for (const s of seats) {
      const last = prev.get(s.id);
      if (last !== undefined && last !== s.balanceCents) {
        nextFlashes.push([s.id, s.balanceCents > last ? "up" : "down"]);
      }
      prev.set(s.id, s.balanceCents);
    }
    if (nextFlashes.length > 0) {
      setFlashing((f) => {
        const m = new Map(f);
        for (const [id, dir] of nextFlashes) m.set(id, dir);
        return m;
      });
      const handle = setTimeout(() => {
        setFlashing((f) => {
          if (f.size === 0) return f;
          const m = new Map(f);
          for (const [id] of nextFlashes) m.delete(id);
          return m;
        });
      }, 700);
      return () => clearTimeout(handle);
    }
  }, [seats]);

  return (
    <aside className="w-full max-w-xs space-y-1 rounded-lg bg-panel p-3">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-muted">
        Leaderboard
      </h3>
      {sorted.map((s, i) => {
        const isSelf = s.id === selfId;
        const flash = flashing.get(s.id);
        return (
          <div
            key={s.id}
            className={`flex items-center justify-between rounded px-2 py-1 text-sm transition-colors duration-500 ${
              isSelf ? "bg-accent/10 font-bold text-accent" : "text-white"
            } ${s.isBusted ? "opacity-50" : ""} ${
              flash === "up"
                ? "ring-1 ring-accent/60 bg-accent/10"
                : flash === "down"
                  ? "ring-1 ring-red-400/60 bg-red-500/10"
                  : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 text-muted tabular-nums">{i + 1}</span>
              <span className="truncate">{s.nickname}</span>
              {s.isBot && (
                <span className="rounded bg-secondary/15 px-1 py-0.5 text-[9px] font-bold text-secondary">
                  CPU
                </span>
              )}
            </span>
            <AnimatedAmount cents={s.balanceCents} durationMs={500} />
          </div>
        );
      })}
    </aside>
  );
}
