"use client";
import { useState } from "react";
import { DiceGame } from "./DiceGame";
import { MinesGame } from "./MinesGame";

type Tab = "dice" | "mines";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dice", label: "Dice", icon: "🎲" },
  { id: "mines", label: "Mines", icon: "💣" },
];

export function GameTabs({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [active, setActive] = useState<Tab>("dice");

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-panel p-1">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all ${
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
      {active === "dice" && (
        <DiceGame lobbyId={lobbyId} balanceCents={balanceCents} />
      )}
      {active === "mines" && (
        <MinesGame lobbyId={lobbyId} balanceCents={balanceCents} />
      )}
    </div>
  );
}
