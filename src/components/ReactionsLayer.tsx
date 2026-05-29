"use client";
import { useEffect, useRef, useState } from "react";

type Floater = {
  id: number;
  emoji: string;
  /** Horizontal position 0-100 (percent of container) */
  x: number;
  /** Random horizontal sway in pixels */
  sway: number;
};

/**
 * Renders emoji that drift upward from the bottom and fade out. Exposes a
 * single `push(emoji)` method by attaching it to a ref the parent passes in.
 */
export function ReactionsLayer({
  pushRef,
}: {
  pushRef: React.MutableRefObject<((emoji: string) => void) | null>;
}) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    pushRef.current = (emoji: string) => {
      const id = ++idRef.current;
      const x = 10 + Math.random() * 80; // avoid edges
      const sway = (Math.random() - 0.5) * 80;
      setFloaters((f) => [...f, { id, emoji, x, sway }]);
      // remove after animation ends (~2.4s)
      setTimeout(() => {
        setFloaters((f) => f.filter((fl) => fl.id !== id));
      }, 2500);
    };
    return () => {
      pushRef.current = null;
    };
  }, [pushRef]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[60vh]">
      {floaters.map((f) => (
        <div
          key={f.id}
          className="absolute bottom-0 select-none text-4xl drop-shadow-lg"
          style={{
            left: `${f.x}%`,
            transform: "translateX(-50%)",
            // CSS variable consumed by the rush-float keyframe below
            ["--rush-sway" as string]: `${f.sway}px`,
            animation: "rush-float 2.4s ease-out forwards",
          }}
        >
          {f.emoji}
        </div>
      ))}
    </div>
  );
}
