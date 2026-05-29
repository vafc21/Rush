"use client";

export type Seat = {
  id: string;
  nickname: string;
  balanceCents: number;
  isBusted: boolean;
};

export function LeaderboardPanel({
  seats,
  selfId,
}: {
  seats: Seat[];
  selfId: string | null;
}) {
  const sorted = [...seats].sort((a, b) => b.balanceCents - a.balanceCents);
  return (
    <aside className="w-full max-w-xs space-y-1 rounded-lg bg-panel p-3">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-muted">Leaderboard</h3>
      {sorted.map((s, i) => {
        const isSelf = s.id === selfId;
        return (
          <div
            key={s.id}
            className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
              isSelf ? "bg-accent/10 font-bold text-accent" : "text-white"
            } ${s.isBusted ? "opacity-50" : ""}`}
          >
            <span className="flex items-center gap-2">
              <span className="w-4 text-muted">{i + 1}</span>
              <span>{s.nickname}</span>
            </span>
            <span className="tabular-nums">
              ${(s.balanceCents / 100).toFixed(2)}
            </span>
          </div>
        );
      })}
    </aside>
  );
}
