"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Smoothly tweens a dollar amount between values. When `cents` changes,
 * the displayed value counts up (or down) over `durationMs`.
 *
 * Used in the TopBar so balance changes don't snap — they roll like a
 * slot machine counter.
 */
export function AnimatedAmount({
  cents,
  durationMs = 600,
  className = "",
}: {
  cents: number;
  durationMs?: number;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(cents);
  const fromRef = useRef(cents);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (cents === displayed) return;
    fromRef.current = displayed;
    startedAtRef.current = performance.now();
    const target = cents;

    const tick = (now: number) => {
      const startedAt = startedAtRef.current!;
      const t = Math.min(1, (now - startedAt) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(
        fromRef.current + (target - fromRef.current) * eased
      );
      setDisplayed(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents, durationMs]);

  return (
    <span className={`tabular-nums ${className}`}>
      ${(displayed / 100).toFixed(2)}
    </span>
  );
}
