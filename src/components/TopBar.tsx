import Link from "next/link";
import { AnimatedAmount } from "./AnimatedAmount";

export function TopBar({
  balanceCents,
  roundSecondsLeft,
  showLeave = false,
}: {
  balanceCents?: number;
  roundSecondsLeft?: number;
  showLeave?: boolean;
}) {
  const lowTime =
    roundSecondsLeft !== undefined && roundSecondsLeft <= 30 && roundSecondsLeft > 0;
  return (
    <header className="flex items-center justify-between border-b border-panel px-4 py-3">
      <Link
        href="/play"
        className="flex items-center gap-2 transition-opacity hover:opacity-80"
      >
        <div className="h-3 w-3 rotate-45 rounded-[2px] bg-gradient-to-br from-accent to-brand" />
        <span className="font-extrabold tracking-widest">RUSH</span>
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {roundSecondsLeft !== undefined && (
          <span
            className={`rounded-md px-3 py-1 tabular-nums transition-colors ${
              lowTime
                ? "animate-pulse bg-red-500/20 font-bold text-red-300"
                : "bg-panel text-secondary"
            }`}
          >
            {formatTime(roundSecondsLeft)}
          </span>
        )}
        {balanceCents !== undefined && (
          <AnimatedAmount
            cents={balanceCents}
            className="rounded-md bg-panel px-3 py-1 font-semibold text-accent"
          />
        )}
        {showLeave && (
          <Link
            href="/play"
            className="rounded-md bg-panel px-3 py-1 text-xs text-muted transition hover:text-white"
          >
            Leave
          </Link>
        )}
      </div>
    </header>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
