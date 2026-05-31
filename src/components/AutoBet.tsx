"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Stake-style auto-bet panel. Sits next to the game's main "Bet/Roll/Spin"
 * button. The host game passes:
 *   - onPlay: an async play action. Resolves when the bet is fully
 *     settled (so the next iteration doesn't overlap the suspense
 *     animation). Return `false` (or throw) to abort the auto-bet
 *     loop — typically when the balance runs out or the server rejects.
 *
 * The user picks a count (or 0 for ∞) and clicks Auto Bet. The button
 * flips to a red Stop button showing live progress. Between bets we
 * pause for `pauseMs` so the result animation is readable.
 */
export function AutoBet({
  onPlay,
  pauseMs = 300,
  className = "",
}: {
  onPlay: () => Promise<boolean | void>;
  pauseMs?: number;
  className?: string;
}) {
  const [countStr, setCountStr] = useState("10");
  const [running, setRunning] = useState(false);
  const [played, setPlayed] = useState(0);
  // Bumped on Stop and on unmount to abort the current loop without
  // depending on closures over the latest state.
  const runIdRef = useRef(0);
  // Always-current ref to onPlay so the loop closure can't go stale.
  const playRef = useRef(onPlay);
  playRef.current = onPlay;

  useEffect(() => {
    if (!running) return;
    const myRun = ++runIdRef.current;
    const targetCount = parseInt(countStr) || 0; // 0 == ∞
    setPlayed(0);
    let p = 0;

    (async () => {
      while (runIdRef.current === myRun) {
        if (targetCount > 0 && p >= targetCount) break;
        let cont: boolean | void;
        try {
          cont = await playRef.current();
        } catch {
          break;
        }
        if (cont === false) break;
        if (runIdRef.current !== myRun) return; // stopped during play
        p += 1;
        setPlayed(p);
        if (pauseMs > 0) {
          await new Promise<void>((r) => setTimeout(r, pauseMs));
        }
      }
      if (runIdRef.current === myRun) setRunning(false);
    })();

    return () => {
      // bumping invalidates the in-flight loop iteration
      runIdRef.current += 1;
    };
  }, [running, countStr, pauseMs]);

  // Stop the loop if the host unmounts
  useEffect(() => () => { runIdRef.current += 1; }, []);

  const toggle = () => {
    if (running) {
      runIdRef.current += 1;
      setRunning(false);
    } else {
      setRunning(true);
    }
  };

  const target = parseInt(countStr) || 0;

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type="number"
        min={0}
        max={9999}
        value={countStr}
        onChange={(e) => setCountStr(e.target.value)}
        disabled={running}
        placeholder="∞"
        title="Number of bets (0 or empty = unlimited)"
        className="w-16 rounded-md bg-bg px-2 py-2 text-center text-sm tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition disabled:opacity-50"
      />
      <button
        type="button"
        onClick={toggle}
        className={`flex-1 rounded-md py-2 text-sm font-bold transition active:scale-[0.98] ${
          running
            ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
            : "bg-brand/15 text-brand hover:bg-brand/25"
        }`}
      >
        {running
          ? `Stop · ${played}${target > 0 ? `/${target}` : ""}`
          : "Auto Bet"}
      </button>
    </div>
  );
}
