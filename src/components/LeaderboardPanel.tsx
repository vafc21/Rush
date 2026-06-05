"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatedAmount } from "./AnimatedAmount";
import { PlayerStatsModal } from "./PlayerStatsModal";

export type Seat = {
  id: string;
  nickname: string;
  balanceCents: number;
  isBusted: boolean;
  isBot?: boolean;
  /**
   * True for a registered account (not a guest, not a CPU). Drives the
   * "Member" badge and the clickable-stats link.
   */
  isMember?: boolean;
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
  // Username whose stats modal is open (members only), or null.
  const [statsFor, setStatsFor] = useState<string | null>(null);

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
        // A registered member (not a guest, not a CPU) — gets the badge and
        // a clickable name that opens their lifetime stats.
        const isMember = !s.isBot && !!s.isMember;
        // The developer account — gets a fancy gold name + black "Dev" badge.
        const isDev = isMember && s.nickname.toLowerCase() === "vlad";
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
              {isMember ? (
                <button
                  type="button"
                  onClick={() => setStatsFor(s.nickname)}
                  title={`View ${s.nickname}'s stats`}
                  className={
                    isDev
                      ? "truncate bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-300 bg-clip-text font-extrabold italic tracking-wide text-transparent drop-shadow-[0_0_6px_rgba(251,191,36,0.45)] transition hover:opacity-80"
                      : "truncate underline decoration-dotted underline-offset-2 transition hover:text-brand"
                  }
                >
                  {s.nickname}
                </button>
              ) : (
                <span className="truncate">{s.nickname}</span>
              )}
              {s.isBot ? (
                <span className="rounded bg-secondary/15 px-1 py-0.5 text-[9px] font-bold text-secondary">
                  CPU
                </span>
              ) : isDev ? (
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black shadow-[0_0_8px_rgba(251,191,36,0.55)] ring-1 ring-amber-200/60">
                  Dev
                </span>
              ) : (
                isMember && (
                  <span className="rounded bg-brand/15 px-1 py-0.5 text-[9px] font-bold text-brand">
                    Member
                  </span>
                )
              )}
            </span>
            <AnimatedAmount cents={s.balanceCents} durationMs={500} />
          </div>
        );
      })}

      <PlayerStatsModal username={statsFor} onClose={() => setStatsFor(null)} />
    </aside>
  );
}
