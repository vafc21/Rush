"use client";
import { useState } from "react";
import { LastChanceWheel } from "./LastChanceWheel";
import { LastChanceMines } from "./LastChanceMines";
import { FlappyGame } from "./FlappyGame";

type Path = "wheel" | "mines" | "flappy";

const PATHS: { id: Path; label: string; icon: string; sub: string }[] = [
  { id: "wheel", label: "Wheel", icon: "🎡", sub: "1 / 50 · $500" },
  { id: "mines", label: "Mines", icon: "💣", sub: "1 / 25 · $500" },
  { id: "flappy", label: "Flappy", icon: "🐦", sub: "skill · cents" },
];

export function LastChanceZone({
  lobbyId,
  onBanked,
  onHold,
}: {
  lobbyId: string;
  /** Apply a freshly-credited balance locally (instant, no realtime wait). */
  onBanked?: (newBalanceCents: number) => void;
  /** Keep the zone mounted through a win reveal even once un-busted. */
  onHold?: (held: boolean) => void;
}) {
  const [active, setActive] = useState<Path>("wheel");

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-widest text-red-300">
        You&apos;re busted · Pick a comeback
      </div>
      <div className="flex gap-1 rounded-lg bg-panel p-1">
        {PATHS.map((p) => {
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-bg text-white shadow-inner"
                  : "text-muted hover:text-secondary"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted">{p.sub}</div>
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
      {active === "flappy" && <FlappyGame lobbyId={lobbyId} onBanked={onBanked} />}
    </div>
  );
}
