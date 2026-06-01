"use client";
import { useRef, useState } from "react";

const EMOJIS = ["🔥", "😱", "💀", "🚀"] as const;
const COOLDOWN_MS = 1500;

export function ReactionsBar({ lobbyId }: { lobbyId: string }) {
  const [onCooldown, setOnCooldown] = useState(false);
  // Guards against rapid double-fires before the cooldown state flips.
  const lastSentRef = useRef(0);

  async function send(emoji: string) {
    const now = Date.now();
    if (now - lastSentRef.current < COOLDOWN_MS) return;
    lastSentRef.current = now;
    // Global cooldown — disables ALL emoji buttons, not just this one,
    // so people can't spam-flood by alternating reactions.
    setOnCooldown(true);
    setTimeout(() => setOnCooldown(false), COOLDOWN_MS);
    await fetch(`/api/lobbies/${lobbyId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
  }

  return (
    <div className="flex gap-2 rounded-lg bg-panel p-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => send(e)}
          disabled={onCooldown}
          className="flex-1 rounded-md bg-bg py-2 text-2xl transition-all hover:bg-bg/60 hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
