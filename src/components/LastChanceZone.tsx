"use client";
import { useState } from "react";
import { LastChanceWheel } from "./LastChanceWheel";
import { LastChanceMines } from "./LastChanceMines";
import { FlappyGame } from "./FlappyGame";

type Path = "wheel" | "mines" | "flappy";

/** Balance a player must reach before the high-reward Flappy path unlocks. */
const FLAPPY_UNLOCK_CENTS = 50_000;

const PATHS: {
  id: Path;
  label: string;
  icon: string;
  sub: string;
  /** If set, the path is locked until balance reaches this many cents. */
  unlockCents?: number;
}[] = [
  { id: "wheel", label: "Wheel", icon: "🎡", sub: "1 / 50 · 500 pts" },
  { id: "mines", label: "Mines", icon: "💣", sub: "1 / 25 · 500 pts" },
  {
    id: "flappy",
    label: "Flappy",
    icon: "🐦",
    sub: "skill · top reward",
    unlockCents: FLAPPY_UNLOCK_CENTS,
  },
];

export function LastChanceZone({
  lobbyId,
  balanceCents,
  onBanked,
  onHold,
}: {
  lobbyId: string;
  /** Current lobby balance — gates locked paths like Flappy. */
  balanceCents: number;
  /** Apply a freshly-credited balance locally (instant, no realtime wait). */
  onBanked?: (newBalanceCents: number) => void;
  /** Keep the zone mounted through a win reveal even once un-busted. */
  onHold?: (held: boolean) => void;
}) {
  const [active, setActive] = useState<Path>("wheel");

  const isLocked = (p: (typeof PATHS)[number]) =>
    p.unlockCents !== undefined && balanceCents < p.unlockCents;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-widest text-red-300">
        You&apos;re busted · Pick a comeback
      </div>
      <div className="flex gap-1 rounded-lg bg-panel p-1">
        {PATHS.map((p) => {
          const isActive = active === p.id;
          const locked = isLocked(p);
          return (
            <button
              key={p.id}
              onClick={() => !locked && setActive(p.id)}
              disabled={locked}
              className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-all ${
                locked
                  ? "cursor-not-allowed text-muted/50"
                  : isActive
                  ? "bg-bg text-white shadow-inner"
                  : "text-muted hover:text-secondary"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span>{locked ? "🔒" : p.icon}</span>
                <span>{p.label}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted">
                {locked ? `$${(p.unlockCents! / 100).toFixed(0)} to unlock` : p.sub}
              </div>
            </button>
          );
        })}
      </div>
      {active === "wheel" && (
        <LastChanceWheel lobbyId={lobbyId} onBanked={onBanked} onHold={onHold} />
      )}
      {active === "mines" && (
        <LastChanceMines lobbyId={lobbyId} onBanked={onBanked} onHold={onHold} />
      )}
      {active === "flappy" &&
        (balanceCents < FLAPPY_UNLOCK_CENTS ? (
          <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-panel to-bg p-8 text-center shadow-xl">
            <div className="text-4xl">🔒</div>
            <h2 className="mt-2 text-lg font-black tracking-tight text-secondary">
              Flappy is locked
            </h2>
            <p className="mt-1 text-sm text-muted">
              Reach a ${(FLAPPY_UNLOCK_CENTS / 100).toFixed(0)} balance to unlock
              the highest-paying comeback.
            </p>
          </div>
        ) : (
          <FlappyGame lobbyId={lobbyId} onBanked={onBanked} />
        ))}
    </div>
  );
}
