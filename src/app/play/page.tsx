"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { TopBar } from "@/components/TopBar";

const SIZES = [4, 8, 16] as const;
const DURATIONS = [
  { seconds: 180, label: "3 min" },
  { seconds: 420, label: "7 min" },
  { seconds: 900, label: "15 min" },
] as const;

export default function HubPage() {
  return (
    <Suspense fallback={<TopBar />}>
      <Hub />
    </Suspense>
  );
}

function Hub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wasKicked = searchParams.get("kicked") === "1";
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [size, setSize] = useState<4 | 8 | 16>(4);
  const [duration, setDuration] = useState<180 | 420 | 900>(180);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ kind: "guest" | "user"; nickname: string } | null>(
    null
  );
  const [findOpen, setFindOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/auth/whoami").then(async (r) => {
      if (r.ok) setMe(await r.json());
    });
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    router.replace("/");
  }

  async function findMatch() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lobbies/matchmake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, durationSeconds: duration }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "could not queue");
      setBusy(false);
      return;
    }
    setSearching(true);
    setBusy(false);
    setFindOpen(false);
  }

  async function cancelSearch() {
    await fetch("/api/lobbies/matchmake", { method: "DELETE" }).catch(() => {});
    setSearching(false);
  }

  // Poll for match assignment while searching
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const tick = async () => {
      // Nudge the matchmaker for local dev so we don't wait the full minute
      fetch("/api/cron/matchmake").catch(() => {});
      const r = await fetch("/api/lobbies/matchmake/status");
      if (!r.ok) return;
      const data = (await r.json()) as { queued: boolean; lobbyId?: string };
      if (cancelled) return;
      if (data.lobbyId) {
        setSearching(false);
        router.push(`/lobby/${data.lobbyId}`);
      }
    };
    const id = setInterval(tick, 2000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [searching, router]);

  async function createLobby() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lobbies/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: duration }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not create lobby");
      return;
    }
    const { lobbyId } = await res.json();
    router.push(`/lobby/${lobbyId}`);
  }

  async function joinLobby() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lobbies/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Lobby not found");
      return;
    }
    const { lobbyId } = await res.json();
    router.push(`/lobby/${lobbyId}`);
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        {me && (
          <div className="flex items-center justify-between rounded-md bg-panel px-3 py-2 text-sm">
            <span className="text-secondary">
              {me.kind === "user" ? "Signed in as " : "Playing as guest: "}
              <span
                className={
                  me.kind === "user"
                    ? "font-bold text-brand"
                    : "font-semibold text-white"
                }
              >
                {me.nickname}
              </span>
            </span>
            <div className="flex items-center gap-3">
              {me.kind === "user" && (
                <Link
                  href="/profile"
                  className="text-xs font-semibold text-muted transition hover:text-white"
                >
                  Profile
                </Link>
              )}
              <button
                onClick={signOut}
                className="text-xs font-semibold text-muted transition hover:text-white"
              >
                {me.kind === "user" ? "Sign out" : "Exit"}
              </button>
            </div>
          </div>
        )}
        {wasKicked && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            You were removed from that lobby by the host.
          </div>
        )}
        <h1 className="text-xl font-bold">Play</h1>
        <Button onClick={() => setFindOpen(true)}>Find Match</Button>
        <Button variant="secondary" onClick={() => setCreateOpen(true)}>
          Create Lobby
        </Button>
        <Button variant="secondary" onClick={() => setJoinOpen(true)}>
          Join by Code
        </Button>
      </main>

      {/* Searching overlay */}
      {searching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 rounded-lg bg-panel p-8 shadow-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"
                aria-hidden="true"
              />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">Searching for opponents…</p>
              <p className="mt-1 text-xs text-muted">
                {size} players · {duration / 60} min
              </p>
            </div>
            <button
              onClick={cancelSearch}
              className="text-xs font-semibold text-muted underline hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Find Match modal */}
      <Modal
        open={findOpen}
        onClose={() => setFindOpen(false)}
        title="Find Match"
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Players</p>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                    size === s ? "bg-accent text-bg" : "bg-bg text-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Duration</p>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  onClick={() => setDuration(d.seconds)}
                  className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                    duration === d.seconds ? "bg-accent text-bg" : "bg-bg text-secondary"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button onClick={findMatch} disabled={busy}>
            {busy ? "Queueing…" : "Search"}
          </Button>
          <p className="text-center text-[10px] text-muted">
            If no one else is around, you&apos;ll be matched with the next
            available group within 15 seconds.
          </p>
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Lobby">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Duration</p>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  onClick={() => setDuration(d.seconds)}
                  className={`flex-1 rounded-md py-2 text-sm font-semibold ${
                    duration === d.seconds ? "bg-accent text-bg" : "bg-bg text-secondary"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-center text-[10px] text-muted">
            Invite friends with the lobby code, or add CPUs from the
            waiting room.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button onClick={createLobby} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </Modal>

      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Join by Code">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="6-character code"
            className="rounded-md bg-bg px-3 py-2 text-center text-lg tracking-widest text-white outline-none placeholder:text-muted uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button onClick={joinLobby} disabled={busy || code.length !== 6}>
            {busy ? "Joining…" : "Join"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
