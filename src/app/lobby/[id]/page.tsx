"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/Button";
import { LeaderboardPanel, Seat } from "@/components/LeaderboardPanel";
import { DiceGame } from "@/components/DiceGame";
import { useLobbyChannel } from "@/lib/realtime/pusher-client";

type Snapshot = {
  lobby: {
    id: string;
    code: string;
    size: number;
    duration_seconds: number;
    status: "waiting" | "active" | "ended";
    started_at: string | null;
    ended_at: string | null;
  };
  players: Array<{
    id: string;
    nickname: string;
    is_bot: boolean;
    is_busted: boolean;
    balance_cents: number;
    final_rank: number | null;
  }>;
};

export default function LobbyPage() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selfNickname, setSelfNickname] = useState<string | null>(null);

  // Initial snapshot load
  useEffect(() => {
    fetch(`/api/lobbies/${id}/snapshot`).then(async (r) => {
      if (r.ok) {
        setSnapshot(await r.json());
      }
    });
  }, [id]);

  // Self identification
  useEffect(() => {
    fetch("/api/auth/whoami").then(async (r) => {
      if (r.ok) {
        const { nickname } = await r.json();
        setSelfNickname(nickname);
      }
    });
  }, []);

  // 1Hz tick for round timer
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Pusher subscription
  useLobbyChannel(id ?? null, (e) => {
    setSnapshot((s) => {
      if (!s) return s;
      switch (e.type) {
        case "player_joined":
          return {
            ...s,
            players: [
              ...s.players,
              {
                id: e.lobbyPlayerId,
                nickname: e.nickname,
                is_bot: e.isBot,
                is_busted: false,
                balance_cents: 100000,
                final_rank: null,
              },
            ],
          };
        case "balance_update":
          return {
            ...s,
            players: s.players.map((p) =>
              p.id === e.lobbyPlayerId ? { ...p, balance_cents: e.balanceCents } : p
            ),
          };
        case "player_busted":
          return {
            ...s,
            players: s.players.map((p) =>
              p.id === e.lobbyPlayerId ? { ...p, is_busted: true } : p
            ),
          };
        case "lobby_ended":
          return {
            ...s,
            lobby: { ...s.lobby, status: "ended", ended_at: new Date().toISOString() },
            players: s.players.map((p) => {
              const fr = e.finalRanks.find((r) => r.lobbyPlayerId === p.id);
              return fr ? { ...p, final_rank: fr.rank, balance_cents: fr.balanceCents } : p;
            }),
          };
        default:
          return s;
      }
    });
    if (e.type === "lobby_starting") setStartsAt(e.startsAt);
    if (e.type === "lobby_active") setEndsAt(e.endsAt);
  });

  if (!snapshot) return <main className="p-6">Loading…</main>;

  const self = snapshot.players.find((p) => p.nickname === selfNickname);
  const seats: Seat[] = snapshot.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    balanceCents: p.balance_cents,
    isBusted: p.is_busted,
  }));

  const secondsLeft =
    endsAt ? Math.max(0, Math.floor((endsAt - nowMs) / 1000)) : undefined;
  const inCountdown = startsAt !== null && nowMs < startsAt;

  return (
    <>
      <TopBar
        balanceCents={self?.balance_cents}
        roundSecondsLeft={secondsLeft}
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:flex-row">
        <div className="flex-1">
          {snapshot.lobby.status === "waiting" && (
            <Waiting snapshot={snapshot} selfNickname={selfNickname} />
          )}
          {snapshot.lobby.status === "active" && inCountdown && (
            <Countdown startsAt={startsAt!} nowMs={nowMs} />
          )}
          {snapshot.lobby.status === "active" && !inCountdown && self && (
            <DiceGame lobbyId={id!} balanceCents={self.balance_cents} />
          )}
          {snapshot.lobby.status === "ended" && (
            <EndOfRound players={snapshot.players} selfNickname={selfNickname} />
          )}
        </div>
        <LeaderboardPanel seats={seats} selfId={self?.id ?? null} />
      </main>
    </>
  );
}

function Waiting({
  snapshot,
  selfNickname,
}: {
  snapshot: Snapshot;
  selfNickname: string | null;
}) {
  const isHost =
    selfNickname !== null && snapshot.players[0]?.nickname === selfNickname;
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    await fetch(`/api/lobbies/${snapshot.lobby.id}/start`, { method: "POST" });
  }
  return (
    <div className="rounded-lg bg-panel p-6">
      <h2 className="mb-2 text-xl font-bold">Waiting Room</h2>
      <p className="mb-4 text-secondary">
        Share this code: <span className="font-mono text-2xl text-brand">{snapshot.lobby.code}</span>
      </p>
      <p className="mb-1 text-xs uppercase tracking-wider text-muted">
        Seated ({snapshot.players.length} / {snapshot.lobby.size})
      </p>
      <ul className="mb-4 space-y-1">
        {snapshot.players.map((p) => (
          <li key={p.id} className="text-sm">{p.nickname}</li>
        ))}
      </ul>
      {isHost && (
        <Button onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Start Match"}
        </Button>
      )}
    </div>
  );
}

function Countdown({ startsAt, nowMs }: { startsAt: number; nowMs: number }) {
  const secondsLeft = Math.max(0, Math.ceil((startsAt - nowMs) / 1000));
  return (
    <div className="flex h-64 items-center justify-center rounded-lg bg-panel">
      <div className="text-7xl font-black text-accent tabular-nums">{secondsLeft}</div>
    </div>
  );
}

function EndOfRound({
  players,
  selfNickname,
}: {
  players: Snapshot["players"];
  selfNickname: string | null;
}) {
  const ranked = [...players].sort(
    (a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999)
  );
  return (
    <div className="rounded-lg bg-panel p-6">
      <h2 className="mb-4 text-xl font-bold">Final Standings</h2>
      <ol className="space-y-1">
        {ranked.map((p) => {
          const isSelf = p.nickname === selfNickname;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded px-2 py-2 ${
                isSelf ? "bg-accent/10 text-accent" : ""
              } ${p.final_rank === 1 ? "font-bold text-brand" : ""}`}
            >
              <span>
                #{p.final_rank ?? "—"} {p.nickname}
              </span>
              <span className="tabular-nums">
                ${(p.balance_cents / 100).toFixed(2)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
