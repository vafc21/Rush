"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/Button";
import { LeaderboardPanel, Seat } from "@/components/LeaderboardPanel";
import { GameTabs } from "@/components/GameTabs";
import { LastChanceWheel } from "@/components/LastChanceWheel";
import { EndOfRoundGraph } from "@/components/EndOfRoundGraph";
import Link from "next/link";
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

  // Initial snapshot load — also reconstructs startsAt/endsAt if the round
  // is already in progress (i.e. the player refreshed mid-game).
  useEffect(() => {
    fetch(`/api/lobbies/${id}/snapshot`).then(async (r) => {
      if (!r.ok) return;
      const snap: Snapshot = await r.json();
      setSnapshot(snap);
      if (snap.lobby.status === "active" && snap.lobby.started_at) {
        const startedMs = new Date(snap.lobby.started_at).getTime();
        setStartsAt(startedMs);
        setEndsAt(startedMs + snap.lobby.duration_seconds * 1000);
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

  // 4Hz tick for round timer + countdown
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
        case "lobby_starting":
          // Round has begun on the server; flip the snapshot to active so
          // the page shows the countdown overlay (then the game) without
          // requiring a refresh.
          return { ...s, lobby: { ...s.lobby, status: "active" } };
        case "balance_update":
          return {
            ...s,
            players: s.players.map((p) =>
              p.id === e.lobbyPlayerId
                ? {
                    ...p,
                    balance_cents: e.balanceCents,
                    // Rule (mirrors server-side bust check in dice handler):
                    // balance < $1 = busted. Re-deriving here lets a Last
                    // Chance Wheel win lift the busted flag without needing
                    // a separate pusher event.
                    is_busted: e.balanceCents < 100,
                  }
                : p
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

  // Bot activity poller: while the round is active and the countdown has
  // finished, hit the bot-tick endpoint every 4s. Each call may make one
  // random bot place a small dice bet (server decides). With multiple
  // clients open, ticks coalesce naturally — the server is the source of
  // truth on bot decisions.
  const lobbyStatus = snapshot?.lobby.status;
  const inCountdownForPoll = startsAt !== null && nowMs < startsAt;
  useEffect(() => {
    if (!id) return;
    if (lobbyStatus !== "active") return;
    if (inCountdownForPoll) return;
    const t = setInterval(() => {
      fetch(`/api/lobbies/${id}/bot-tick`, { method: "POST" }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [id, lobbyStatus, inCountdownForPoll]);

  // Local-development end-of-round fallback. The "real" round-end runs as
  // a Vercel cron every minute (vercel.json), which doesn't exist when the
  // app is running on localhost. When our locally-computed timer reaches
  // zero and the lobby is still active, fire the cron endpoint directly.
  // The cron is idempotent — calling it for a not-yet-expired lobby is a
  // no-op, and after Pusher's lobby_ended event lands the status flips
  // away from "active" so this effect stops firing.
  useEffect(() => {
    if (lobbyStatus !== "active") return;
    if (endsAt === null) return;
    if (nowMs < endsAt) return;
    const handle = setTimeout(() => {
      fetch(`/api/cron/end-rounds`).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [lobbyStatus, endsAt, nowMs]);

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
        showLeave
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
            self.is_busted ? (
              <LastChanceWheel lobbyId={id!} />
            ) : (
              <GameTabs lobbyId={id!} balanceCents={self.balance_cents} />
            )
          )}
          {snapshot.lobby.status === "ended" && (
            <EndOfRound lobbyId={id!} selfNickname={selfNickname} />
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
    const res = await fetch(`/api/lobbies/${snapshot.lobby.id}/start`, { method: "POST" });
    // If Pusher takes a moment to deliver the lobby_starting event back to
    // this very client (it should be near-instant but isn't guaranteed),
    // we don't want to leave the host staring at the waiting room. The
    // page-level Pusher handler flips status to "active" on lobby_starting,
    // but as belt-and-braces we leave the button in its busy state — the
    // page will rerender shortly after the event arrives.
    if (!res.ok) setBusy(false);
  }
  return (
    <div className="rounded-lg bg-panel p-6">
      <h2 className="mb-2 text-xl font-bold">Waiting Room</h2>
      <p className="mb-4 text-secondary">
        Share this code:{" "}
        <span className="font-mono text-2xl text-brand">{snapshot.lobby.code}</span>
      </p>
      <p className="mb-1 text-xs uppercase tracking-wider text-muted">
        Seated ({snapshot.players.length} / {snapshot.lobby.size})
      </p>
      <ul className="mb-4 space-y-1">
        {snapshot.players.map((p) => (
          <li key={p.id} className="text-sm">
            {p.nickname}
          </li>
        ))}
      </ul>
      {isHost && (
        <Button onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Start Match"}
        </Button>
      )}
      {!isHost && (
        <p className="text-xs text-muted">Waiting for the host to start the match…</p>
      )}
    </div>
  );
}

function Countdown({ startsAt, nowMs }: { startsAt: number; nowMs: number }) {
  const msLeft = Math.max(0, startsAt - nowMs);
  const secondsLeft = Math.ceil(msLeft / 1000);
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-lg bg-panel">
      <p className="mb-2 text-xs uppercase tracking-widest text-muted">Get ready</p>
      <div className="text-7xl font-black text-accent tabular-nums">
        {secondsLeft}
      </div>
    </div>
  );
}

function EndOfRound({
  lobbyId,
  selfNickname,
}: {
  lobbyId: string;
  selfNickname: string | null;
}) {
  return (
    <div className="space-y-4">
      <EndOfRoundGraph lobbyId={lobbyId} selfNickname={selfNickname} />
      <div className="flex gap-3">
        <Link
          href="/play"
          replace
          className="flex-1 rounded-md bg-accent px-4 py-3 text-center text-sm font-bold text-bg transition hover:opacity-90 active:scale-[0.98]"
        >
          Back to Hub
        </Link>
        <Link
          href="/play"
          replace
          className="rounded-md bg-panel px-4 py-3 text-center text-sm font-semibold text-secondary transition hover:bg-panel/80 active:scale-[0.98]"
        >
          New Match
        </Link>
      </div>
    </div>
  );
}
