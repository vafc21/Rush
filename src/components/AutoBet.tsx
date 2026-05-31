"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Stake-style auto-bet toggle. Sits next to the game's main
 * "Bet/Roll/Spin" button. The host game passes:
 *   - onPlay: an async play action. Resolves when the bet is fully
 *     settled (so the next iteration doesn't overlap the suspense
 *     animation). Return `false` (or throw) to abort the loop —
 *     typically when the balance runs out or the server rejects.
 *
 * Click "Auto Bet" to start. It keeps firing forever until you click
 * "Stop" (or a play returns false). The button shows a running count
 * for feedback. Between bets we pause for `pauseMs` so the result
 * animation is readable.
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
    setPlayed(0);
    let p = 0;

    (async () => {
      while (runIdRef.current === myRun) {
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
  }, [running, pauseMs]);

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

  return (
    <button
      type="button"
      onClick={toggle}
      className={`w-full rounded-md py-2 text-sm font-bold transition active:scale-[0.98] ${
        running
          ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
          : "bg-brand/15 text-brand hover:bg-brand/25"
      } ${className}`}
    >
      {running ? `Stop Auto${played > 0 ? ` · ${played}` : ""}` : "Auto Bet"}
    </button>
  );
}
