"use client";
import { useState } from "react";
import { CrashGame } from "./CrashGame";
import { DiceGame } from "./DiceGame";
import { MinesGame } from "./MinesGame";
import { LimboGame } from "./LimboGame";
import { DragonTowerGame } from "./DragonTowerGame";
import { PlinkoGame } from "./PlinkoGame";
import { KenoGame } from "./KenoGame";
import { HiloGame } from "./HiloGame";

type Tab =
  | "crash"
  | "dice"
  | "mines"
  | "limbo"
  | "plinko"
  | "tower"
  | "keno"
  | "hilo";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "crash", label: "Crash", icon: "🚀" },
  { id: "dice", label: "Dice", icon: "🎲" },
  { id: "mines", label: "Mines", icon: "💣" },
  { id: "limbo", label: "Limbo", icon: "🌙" },
  { id: "plinko", label: "Plinko", icon: "🎯" },
  { id: "tower", label: "Tower", icon: "🐉" },
  { id: "keno", label: "Keno", icon: "🎱" },
  { id: "hilo", label: "Hilo", icon: "🃏" },
];

export function GameTabs({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [active, setActive] = useState<Tab>("crash");

  return (
    <div className="space-y-3">
      {/* Scrollable tab strip — 8 tabs don't all fit on mobile */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg bg-panel p-1">
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-bg text-white shadow-inner"
                    : "text-muted hover:text-secondary"
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {active === "crash" && <CrashGame lobbyId={lobbyId} balanceCents={balanceCents} />}
      {active === "dice" && <DiceGame lobbyId={lobbyId} balanceCents={balanceCents} />}
      {active === "mines" && <MinesGame lobbyId={lobbyId} balanceCents={balanceCents} />}
      {active === "limbo" && <LimboGame lobbyId={lobbyId} balanceCents={balanceCents} />}
      {active === "plinko" && <PlinkoGame lobbyId={lobbyId} balanceCents={balanceCents} />}
      {active === "tower" && (
        <DragonTowerGame lobbyId={lobbyId} balanceCents={balanceCents} />
      )}
      {active === "keno" && <KenoGame lobbyId={lobbyId} balanceCents={balanceCents} />}
      {active === "hilo" && <HiloGame lobbyId={lobbyId} balanceCents={balanceCents} />}
    </div>
  );
}
