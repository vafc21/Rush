"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
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

export default function ProfilePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile/stats").then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? "could not load stats");
        return;
      }
      setStats(await r.json());
    });
  }, []);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-md space-y-4 p-6">
        <Link
          href="/play"
          className="text-xs font-semibold text-muted transition hover:text-white"
        >
          ← Back to Play
        </Link>

        {error && (
          <div className="rounded-lg bg-panel p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              href="/sign-in"
              className="mt-3 inline-block text-xs font-semibold text-brand hover:underline"
            >
              Sign in
            </Link>
          </div>
        )}

        {stats && (
          <>
            <div className="rounded-lg bg-panel p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-2xl">
                  🏆
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted">
                    Signed in as
                  </p>
                  <h1 className="text-xl font-black text-brand">
                    {stats.username}
                  </h1>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Lobbies played"
                value={stats.totalGames.toString()}
              />
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
                value={`${stats.lifetimeProfitCents >= 0 ? "+" : "−"}${pts(Math.abs(stats.lifetimeProfitCents))} pts`}
                accent={stats.lifetimeProfitCents >= 0}
                danger={stats.lifetimeProfitCents < 0}
              />
              <Stat
                label="Biggest bet"
                value={`${pts(stats.biggestBetCents)} pts`}
              />
            </div>
          </>
        )}

        {!stats && !error && (
          <div className="rounded-lg bg-panel p-6 text-center text-sm text-muted">
            Loading stats…
          </div>
        )}
      </main>
    </>
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
    <div className="rounded-lg bg-panel p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
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
