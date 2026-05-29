"use client";
import { useState } from "react";

const EMOJIS = ["🔥", "😱", "💀", "🚀"] as const;

export function ReactionsBar({ lobbyId }: { lobbyId: string }) {
  const [cooldown, setCooldown] = useState<string | null>(null);

  async function send(emoji: string) {
    if (cooldown) return;
    setCooldown(emoji);
    await fetch(`/api/lobbies/${lobbyId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
    // brief per-button cooldown so people can't spam-flood
    setTimeout(() => setCooldown(null), 350);
  }

  return (
    <div className="flex gap-2 rounded-lg bg-panel p-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => send(e)}
          disabled={cooldown === e}
          className="flex-1 rounded-md bg-bg py-2 text-2xl transition-all hover:bg-bg/60 hover:scale-110 active:scale-95 disabled:opacity-40"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
