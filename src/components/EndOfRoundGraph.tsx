"use client";
import { useEffect, useState } from "react";
import { AnimatedAmount } from "./AnimatedAmount";

type Results = {
  lobby: {
    id: string;
    code: string;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    starting_balance_cents: number;
  };
  players: Array<{
    id: string;
    nickname: string;
    is_bot: boolean;
    balance_cents: number;
    final_rank: number | null;
  }>;
  bets: Array<{
    lobby_player_id: string;
    placed_at: string;
    bet_amount_cents: number;
    payout_cents: number;
  }>;
};

const W = 800;
const H = 320;

export function EndOfRoundGraph({
  lobbyId,
  selfNickname,
}: {
  lobbyId: string;
  selfNickname: string | null;
}) {
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    fetch(`/api/lobbies/${lobbyId}/results`).then(async (r) => {
      if (r.ok) setResults((await r.json()) as Results);
    });
  }, [lobbyId]);

  if (!results) {
    return (
      <div className="rounded-lg bg-panel p-6">
        <p className="text-secondary">Loading results…</p>
      </div>
    );
  }

  const { lobby, players, bets } = results;
  const startMs = new Date(lobby.started_at).getTime();
  const endMs = lobby.ended_at
    ? new Date(lobby.ended_at).getTime()
    : startMs + lobby.duration_seconds * 1000;
  const durationMs = Math.max(1, endMs - startMs);

  // Per-player trajectories. Each is a sequence of [tMs, balanceCents]
  // points anchored at round start and end.
  const trajectories = players.map((p) => {
    const playerBets = bets
      .filter((b) => b.lobby_player_id === p.id)
      .sort(
        (a, b) =>
          new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime()
      );
    let bal = lobby.starting_balance_cents;
    const pts: Array<[number, number]> = [[0, bal]];
    for (const b of playerBets) {
      bal += b.payout_cents - b.bet_amount_cents;
      const tMs = Math.max(
        0,
        Math.min(durationMs, new Date(b.placed_at).getTime() - startMs)
      );
      pts.push([tMs, bal]);
    }
    // Anchor at end with the final balance so every line spans the full width
    pts.push([durationMs, p.balance_cents]);
    return { player: p, points: pts };
  });

  // Y-axis bounds with a touch of padding
  const balances = trajectories.flatMap((t) => t.points.map(([, b]) => b));
  const min = Math.min(0, ...balances);
  const max = Math.max(lobby.starting_balance_cents, ...balances);
  const yPad = Math.max(1000, (max - min) * 0.08);
  const yMin = min - yPad;
  const yMax = max + yPad;

  const xScale = (t: number) => (t / durationMs) * W;
  const yScale = (b: number) => H - ((b - yMin) / (yMax - yMin)) * H;

  // Find self + leader for highlighting
  const leader = players.find((p) => p.final_rank === 1);

  // Sort: render unhighlighted lines first, then leader/self on top
  const z = (t: (typeof trajectories)[number]) => {
    const isSelf = t.player.nickname === selfNickname;
    const isLeader = leader && t.player.id === leader.id;
    return isSelf ? 2 : isLeader ? 1 : 0;
  };
  const sortedLines = [...trajectories].sort((a, b) => z(a) - z(b));

  // Reference line at starting balance
  const yStart = yScale(lobby.starting_balance_cents);

  // Lobby average trajectory: sample 60 evenly-spaced times across the
  // round and average everyone's balance at each sample. Each player's
  // trajectory is a step function (balance changes at bet times) so the
  // sample is "their most-recent point at-or-before t".
  const SAMPLES = 60;
  function balanceAt(points: Array<[number, number]>, tMs: number): number {
    let bal = points[0][1];
    for (const [t, b] of points) {
      if (t <= tMs) bal = b;
      else break;
    }
    return bal;
  }
  const avgPoints: string[] = [];
  if (trajectories.length > 0) {
    for (let i = 0; i <= SAMPLES; i++) {
      const tMs = (i / SAMPLES) * durationMs;
      const balances = trajectories.map((t) => balanceAt(t.points, tMs));
      const avg = balances.reduce((s, b) => s + b, 0) / balances.length;
      avgPoints.push(`${xScale(tMs)},${yScale(avg)}`);
    }
  }

  // Final standings, sorted by rank
  const standings = [...players].sort(
    (a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999)
  );

  return (
    <div className="space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Final Standings</h2>
        <p className="text-xs uppercase tracking-widest text-muted">
          Round complete
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4 bg-accent" />
          You
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4 bg-brand" />
          Winner
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-[2px] w-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg,#B1BAD3 0 3px,transparent 3px 5px)",
            }}
          />
          Lobby average
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4 bg-muted opacity-50" />
          Others
        </span>
      </div>

      {/* Graph */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
        >
          {/* Starting balance reference line */}
          <line
            x1={0}
            x2={W}
            y1={yStart}
            y2={yStart}
            stroke="#7B8BA8"
            strokeWidth={0.8}
            strokeDasharray="4 4"
            opacity={0.4}
          />
          {/* Lobby average — dashed, fades in alongside the player lines. */}
          {avgPoints.length > 0 && (
            <polyline
              points={avgPoints.join(" ")}
              fill="none"
              stroke="#B1BAD3"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeLinecap="round"
              style={{
                opacity: 0,
                animation: "rush-fade 4.5s ease-out forwards",
              }}
            />
          )}
          {/* Player trajectories */}
          {sortedLines.map((t) => {
            const isSelf = t.player.nickname === selfNickname;
            const isLeader = leader && t.player.id === leader.id;
            const color = isSelf
              ? "#00E701"
              : isLeader
                ? "#FFB800"
                : "#7B8BA8";
            const strokeWidth = isSelf || isLeader ? 3 : 1.25;
            const opacity = isSelf ? 1 : isLeader ? 0.95 : 0.45;
            const pts = t.points
              .map(([t, b]) => `${xScale(t)},${yScale(b)}`)
              .join(" ");
            return (
              <polyline
                key={t.player.id}
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1,
                  animation: "rush-draw 4.5s ease-out forwards",
                }}
              />
            );
          })}
        </svg>

        {/* Y-axis labels */}
        <div className="pointer-events-none absolute right-1 top-0 flex h-full flex-col justify-between py-1 text-[10px] text-muted tabular-nums">
          <span>${(yMax / 100).toFixed(0)}</span>
          <span>${(lobby.starting_balance_cents / 100).toFixed(0)}</span>
          <span>${(yMin / 100).toFixed(0)}</span>
        </div>
      </div>

      {/* Standings list */}
      <ol className="space-y-1">
        {standings.map((p) => {
          const isSelf = p.nickname === selfNickname;
          const isTop = p.final_rank === 1;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded px-2 py-2 ${
                isSelf
                  ? "bg-accent/10 text-accent"
                  : isTop
                    ? "bg-brand/10 text-brand"
                    : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`inline-block w-5 text-right tabular-nums ${
                    isTop ? "font-black" : ""
                  }`}
                >
                  #{p.final_rank ?? "—"}
                </span>
                <span className={isTop ? "font-bold" : ""}>{p.nickname}</span>
                {isSelf && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                    you
                  </span>
                )}
              </span>
              <AnimatedAmount cents={p.balance_cents} durationMs={1200} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
