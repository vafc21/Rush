export function TopBar({ balanceCents, roundSecondsLeft }: {
  balanceCents?: number;
  roundSecondsLeft?: number;
}) {
  return (
    <header className="flex items-center justify-between border-b border-panel px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rotate-45 rounded-[2px] bg-gradient-to-br from-accent to-brand" />
        <span className="font-extrabold tracking-widest">RUSH</span>
      </div>
      <div className="flex items-center gap-3 text-sm tabular-nums">
        {roundSecondsLeft !== undefined && (
          <span className="rounded-md bg-panel px-3 py-1 text-secondary">
            {formatTime(roundSecondsLeft)}
          </span>
        )}
        {balanceCents !== undefined && (
          <span className="rounded-md bg-panel px-3 py-1 font-semibold text-accent">
            ${(balanceCents / 100).toFixed(2)}
          </span>
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
