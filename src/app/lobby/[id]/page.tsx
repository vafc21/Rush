"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/Button";
import { LeaderboardPanel, Seat } from "@/components/LeaderboardPanel";
import { GameTabs } from "@/components/GameTabs";
import { LastChanceZone } from "@/components/LastChanceZone";
import { EndOfRoundGraph } from "@/components/EndOfRoundGraph";
import { ReactionsBar } from "@/components/ReactionsBar";
import { ReactionsLayer } from "@/components/ReactionsLayer";
import Link from "next/link";
import { useLobbyChannel } from "@/lib/realtime/pusher-client";

type Snapshot = {
  lobby: {
    id: string;
    code: string;
    type: "public" | "private";
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
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selfNickname, setSelfNickname] = useState<string | null>(null);
  // Keeps the Last Chance zone mounted through a win reveal (wheel spin /
  // mines flip), even after the win has already cleared our busted flag.
  const [lastChanceHold, setLastChanceHold] = useState(false);
  // Once we've ever found ourselves in the lobby, track that. If we then
  // disappear (host kicked/banned us), redirect home.
  const everSeenSelfRef = useRef(false);
  // Ref-bridge for pushing emojis into the floating layer from outside
  // the layer's own render scope (specifically, from the pusher handler).
  const pushReactionRef = useRef<((emoji: string) => void) | null>(null);

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
    // Side effects that don't belong inside a state-updater function run
    // first. Calling setFloaters (via pushReactionRef) from inside
    // setSnapshot's updater violates React's purity rule for updaters and
    // can fire setState on another component during render.
    if (e.type === "reaction" && pushReactionRef.current) {
      pushReactionRef.current(e.emoji);
    }

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
        case "player_left":
          return {
            ...s,
            players: s.players.filter((p) => p.id !== e.lobbyPlayerId),
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
                    // Only *clear* the busted flag here, on recovery (a Last
                    // Chance win crediting the balance back above the minimum
                    // bet). We must NOT *set* busted from a low balance: games
                    // that deduct a still-pending wager (e.g. a Crash bet
                    // before the round resolves) broadcast a momentary sub-$1
                    // balance, and inferring "busted" from it would wrongly
                    // kick the player into the Last Chance zone mid-round
                    // while the server still considers them un-busted. The
                    // authoritative `player_busted` event is the only signal
                    // that sets the flag.
                    is_busted: e.balanceCents >= 100 ? false : p.is_busted,
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
        case "reaction":
          // Handled as a side effect above; snapshot is unchanged.
          return s;
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

  // Bot activity poller + crash-tick poller. Both run on a 4-second cadence
  // while the round is live so bots keep playing and Crash rounds keep
  // cycling. In production these have Vercel crons, but local dev relies
  // on these polls.
  const lobbyStatus = snapshot?.lobby.status;
  const inCountdownForPoll = startsAt !== null && nowMs < startsAt;
  useEffect(() => {
    if (!id) return;
    if (lobbyStatus !== "active") return;
    if (inCountdownForPoll) return;
    // Fire immediately so the lobby doesn't sit idle the first 4 seconds
    fetch(`/api/lobbies/${id}/bot-tick`, { method: "POST" }).catch(() => {});
    fetch(`/api/cron/crash-tick`).catch(() => {});
    const t = setInterval(() => {
      fetch(`/api/lobbies/${id}/bot-tick`, { method: "POST" }).catch(() => {});
      fetch(`/api/cron/crash-tick`).catch(() => {});
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

  // Kick/ban detection: once we've been seen in this lobby, disappearing
  // from the player list means the host removed us. Send the player
  // back to the hub.
  const selfStillPresent =
    !!snapshot &&
    !!selfNickname &&
    snapshot.players.some((p) => p.nickname === selfNickname);
  useEffect(() => {
    if (!snapshot) return;
    if (selfStillPresent) {
      everSeenSelfRef.current = true;
      return;
    }
    if (everSeenSelfRef.current && snapshot.lobby.status !== "ended") {
      router.replace("/play?kicked=1");
    }
  }, [snapshot, selfStillPresent, router]);

  if (!snapshot) return <main className="p-6">Loading…</main>;

  const self = snapshot.players.find((p) => p.nickname === selfNickname);
  const seats: Seat[] = snapshot.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    balanceCents: p.balance_cents,
    isBusted: p.is_busted,
    isBot: p.is_bot,
  }));

  const secondsLeft =
    endsAt ? Math.max(0, Math.floor((endsAt - nowMs) / 1000)) : undefined;
  const inCountdown = startsAt !== null && nowMs < startsAt;

  // Apply a freshly-credited balance to our own seat immediately, so Last
  // Chance winnings show up the instant the server confirms them rather than
  // waiting on the realtime `balance_update` round-trip.
  function applyLocalBalance(newBalanceCents: number) {
    setSnapshot((s) => {
      if (!s || !selfNickname) return s;
      return {
        ...s,
        players: s.players.map((p) =>
          p.nickname === selfNickname
            ? {
                ...p,
                balance_cents: newBalanceCents,
                is_busted: newBalanceCents >= 100 ? false : p.is_busted,
              }
            : p
        ),
      };
    });
  }

  async function handleLeave() {
    // Free the seat (only acts while waiting; harmless otherwise) so the
    // host role hands off to the next player, then head to the hub.
    try {
      await fetch(`/api/lobbies/${id}/leave`, { method: "POST" });
    } catch {
      /* navigate anyway */
    }
    router.replace("/play");
  }

  return (
    <>
      <TopBar
        balanceCents={self?.balance_cents}
        roundSecondsLeft={secondsLeft}
        showLeave
        onLeave={handleLeave}
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:gap-6 sm:p-6 md:flex-row">
        <div className="flex-1">
          {snapshot.lobby.status === "waiting" && (
            <Waiting snapshot={snapshot} selfNickname={selfNickname} />
          )}
          {snapshot.lobby.status === "active" && inCountdown && (
            <Countdown startsAt={startsAt!} nowMs={nowMs} />
          )}
          {snapshot.lobby.status === "active" && !inCountdown && self && (
            self.is_busted || lastChanceHold ? (
              <LastChanceZone
                lobbyId={id!}
                onBanked={applyLocalBalance}
                onHold={setLastChanceHold}
              />
            ) : (
              <GameTabs lobbyId={id!} balanceCents={self.balance_cents} />
            )
          )}
          {snapshot.lobby.status === "ended" && (
            <EndOfRound lobbyId={id!} selfNickname={selfNickname} />
          )}
        </div>
        <div className="flex flex-col gap-3">
          <LeaderboardPanel seats={seats} selfId={self?.id ?? null} />
          {snapshot.lobby.status === "active" && !inCountdown && (
            <ReactionsBar lobbyId={id!} />
          )}
        </div>
      </main>
      <ReactionsLayer pushRef={pushReactionRef} />
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
  const hostPlayer = snapshot.players[0];
  const isHost =
    selfNickname !== null && hostPlayer?.nickname === selfNickname;
  const isCustom = snapshot.lobby.type === "private";
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const joinLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${snapshot.lobby.code}`
      : "";

  async function copy(kind: "code" | "link") {
    const text = kind === "code" ? snapshot.lobby.code : joinLink;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can fail (insecure context / denied). Fall back
      // to a temporary textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lobbies/${snapshot.lobby.id}/start`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "could not start");
      setBusy(false);
    }
  }

  async function addCpu() {
    setActionBusy("add");
    setError(null);
    const res = await fetch(
      `/api/lobbies/${snapshot.lobby.id}/add-cpu`,
      { method: "POST" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "could not add CPU");
    }
    setActionBusy(null);
  }

  async function kick(lobbyPlayerId: string) {
    setActionBusy(`k-${lobbyPlayerId}`);
    setError(null);
    const res = await fetch(`/api/lobbies/${snapshot.lobby.id}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyPlayerId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "kick failed");
    }
    setActionBusy(null);
  }

  async function ban(lobbyPlayerId: string) {
    setActionBusy(`b-${lobbyPlayerId}`);
    setError(null);
    const res = await fetch(`/api/lobbies/${snapshot.lobby.id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyPlayerId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "ban failed");
    }
    setActionBusy(null);
  }

  return (
    <div className="rounded-lg bg-panel p-6">
      <h2 className="mb-2 text-xl font-bold">Waiting Room</h2>

      {/* Invite: friends can use the code, or click a one-tap join link */}
      <div className="mb-4 rounded-md bg-bg/40 p-3">
        <p className="text-xs uppercase tracking-wider text-muted">Invite</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-2xl tracking-widest text-brand">
            {snapshot.lobby.code}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => copy("code")}
              className="rounded-md bg-bg px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-bg/70 active:scale-95"
            >
              {copied === "code" ? "Copied!" : "Copy code"}
            </button>
            <button
              onClick={() => copy("link")}
              className="rounded-md bg-brand/15 px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-brand/25 active:scale-95"
            >
              {copied === "link" ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
        <p className="mt-2 truncate text-[11px] text-muted" title={joinLink}>
          {joinLink}
        </p>
      </div>

      <p className="mb-1 text-xs uppercase tracking-wider text-muted">
        Seated ({snapshot.players.length})
      </p>
      <ul className="mb-4 space-y-1">
        {snapshot.players.map((p, idx) => {
          const isThisHost = idx === 0;
          const isSelf = selfNickname === p.nickname;
          return (
            <li
              key={p.id}
              className="flex items-center justify-between rounded bg-bg/40 px-2 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="truncate">{p.nickname}</span>
                {p.is_bot && (
                  <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                    CPU
                  </span>
                )}
                {isThisHost && (
                  <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    HOST
                  </span>
                )}
                {isSelf && !isThisHost && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    YOU
                  </span>
                )}
              </span>
              {isHost && isCustom && !isThisHost && (
                <span className="flex shrink-0 gap-1">
                  <button
                    onClick={() => kick(p.id)}
                    disabled={actionBusy === `k-${p.id}`}
                    className="rounded bg-bg px-2 py-0.5 text-[10px] font-bold text-muted transition hover:bg-bg/70 hover:text-white disabled:opacity-50"
                  >
                    Kick
                  </button>
                  {!p.is_bot && (
                    <button
                      onClick={() => ban(p.id)}
                      disabled={actionBusy === `b-${p.id}`}
                      className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Ban
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {isHost && isCustom && (
        <button
          onClick={addCpu}
          disabled={actionBusy === "add" || snapshot.players.length >= 32}
          className="mb-3 w-full rounded-md border border-dashed border-secondary/40 px-3 py-2 text-sm font-semibold text-secondary transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {actionBusy === "add" ? "Adding…" : "+ Add CPU"}
        </button>
      )}
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {isHost && (
        <Button onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Start Match"}
        </Button>
      )}
      {!isHost && (
        <p className="text-xs text-muted">
          Waiting for the host to start the match…
        </p>
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
