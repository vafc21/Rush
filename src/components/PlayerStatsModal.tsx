"use client";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";
import { pts } from "@/lib/format";

type Stats = {
  username: string;
  totalGames: number;
  gamesFinished: number;
  wins: number;
  winRate: number;
  biggestSingleWinCents: number;
  biggestLobbyFinishCents: number;
  lifetimeProfitCents: number;
  biggestBetCents: number;
};

/**
 * Read-only lifetime stats for a registered member, opened by clicking
 * their name in the leaderboard. Fetches `/api/users/[username]/stats`
 * whenever `username` becomes non-null.
 */
export function PlayerStatsModal({
  username,
  onClose,
}: {
  username: string | null;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    setStats(null);
    setError(null);
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(username)}/stats`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setError(body.error ?? "could not load stats");
          return;
        }
        setStats(await r.json());
      })
      .catch(() => {
        if (!cancelled) setError("could not load stats");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <Modal open={username !== null} onClose={onClose} title={username ?? ""}>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!stats && !error && (
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-sm text-muted">
          <Spinner className="h-8 w-8" />
          Loading stats…
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Lobbies played" value={stats.totalGames.toString()} />
          <Stat
            label="Win rate"
            value={
              stats.gamesFinished > 0
                ? `${(stats.winRate * 100).toFixed(0)}%`
                : "—"
            }
            hint={`${stats.wins} / ${stats.gamesFinished}`}
          />
          <Stat
            label="Biggest single win"
            value={`${pts(stats.biggestSingleWinCents)} pts`}
            accent
          />
          <Stat
            label="Biggest end balance"
            value={`${pts(stats.biggestLobbyFinishCents)} pts`}
            accent
          />
          <Stat
            label="Lifetime P / L"
            value={`${stats.lifetimeProfitCents >= 0 ? "+" : "−"}${pts(
              Math.abs(stats.lifetimeProfitCents)
            )} pts`}
            accent={stats.lifetimeProfitCents >= 0}
            danger={stats.lifetimeProfitCents < 0}
          />
          <Stat label="Biggest bet" value={`${pts(stats.biggestBetCents)} pts`} />
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
  danger = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg bg-bg p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-black tabular-nums ${
          danger ? "text-red-300" : accent ? "text-accent" : "text-white"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
