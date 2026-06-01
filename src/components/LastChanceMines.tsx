"use client";
import { useEffect, useRef, useState } from "react";
import { pts } from "@/lib/format";

const TILES = 25;
const COOLDOWN_MS = 5_000;

const WIN_LINGER_MS = 2_400; // let the player see the win before leaving the zone

export function LastChanceMines({
  lobbyId,
  onBanked,
  onHold,
}: {
  lobbyId: string;
  onBanked?: (newBalanceCents: number) => void;
  onHold?: (held: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{
    won: boolean;
    safeTile: number;
    rebuyCents: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;

  // Release any outstanding hold if we unmount mid-reveal.
  useEffect(() => () => onHoldRef.current?.(false), []);

  // Cooldown tick
  if (cooldownUntil) {
    setTimeout(() => setNowMs(Date.now()), 250);
  }
  const cooldownLeft = cooldownUntil
    ? Math.max(0, cooldownUntil - nowMs)
    : 0;
  const onCooldown = cooldownLeft > 0;

  async function click(tileIndex: number) {
    if (busy || onCooldown) return;
    setBusy(true);
    setError(null);
    setPicked(tileIndex);
    const res = await fetch(`/api/lobbies/${lobbyId}/last-chance/mines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tileIndex }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "click failed");
      setPicked(null);
      return;
    }
    const data = (await res.json()) as {
      won: boolean;
      safeTile: number;
      rebuyCents: number;
    };
    setResult(data);
    if (data.won) {
      // Winning clears the busted flag server-side (and broadcasts it),
      // which would unmount this component before the player sees the
      // result. Hold the zone open for the reveal, then hand back control.
      onHold?.(true);
      onBanked?.(data.rebuyCents);
      setTimeout(() => onHold?.(false), WIN_LINGER_MS);
    } else {
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      // Reset to a new attempt after the cooldown elapses
      setTimeout(() => {
        setResult(null);
        setPicked(null);
        setCooldownUntil(null);
      }, COOLDOWN_MS);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6 text-center">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted">Last Chance</p>
        <h2 className="text-xl font-black text-brand">Mines</h2>
        <p className="mt-1 text-xs text-secondary">
          Pick the one safe tile. 1 in {TILES} for a 500 pts rebuy.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: TILES }, (_, i) => {
          let cls = "bg-bg hover:bg-accent/20 hover:scale-[1.03] cursor-pointer";
          if (busy || onCooldown || result) {
            cls = "bg-bg/40 cursor-default";
          }
          if (result && i === result.safeTile) {
            cls = "bg-accent/30 text-accent";
          } else if (result && i === picked && !result.won) {
            cls = "bg-red-500/30 text-red-300";
          } else if (result && i !== result.safeTile) {
            cls = "bg-bg/30";
          }
          return (
            <button
              key={i}
              disabled={busy || onCooldown || result !== null}
              onClick={() => click(i)}
              className={`aspect-square rounded-md text-xl font-bold transition-all duration-200 active:scale-95 ${cls}`}
              style={
                result
                  ? { animation: "rush-pop 250ms ease-out" }
                  : undefined
              }
            >
              {result
                ? i === result.safeTile
                  ? "✓"
                  : i === picked
                    ? "✗"
                    : ""
                : ""}
            </button>
          );
        })}
      </div>

      {!result && !error && (
        <p className="text-xs text-muted">Pick any tile</p>
      )}
      {result?.won && (
        <div className="rounded-md bg-accent/10 px-3 py-3 text-sm font-bold text-accent">
          You found it! +{pts(result.rebuyCents)} pts — back in the game.
        </div>
      )}
      {result && !result.won && (
        <div className="rounded-md bg-red-500/10 px-3 py-3 text-sm font-bold text-red-300">
          That was a mine. Try again in {Math.ceil(cooldownLeft / 1000)}s.
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
