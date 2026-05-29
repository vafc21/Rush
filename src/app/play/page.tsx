"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { TopBar } from "@/components/TopBar";

const SIZES = [4, 8, 16] as const;
const DURATIONS = [
  { seconds: 180, label: "3 min" },
  { seconds: 420, label: "7 min" },
  { seconds: 900, label: "15 min" },
] as const;

export default function Hub() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [size, setSize] = useState<4 | 8 | 16>(4);
  const [duration, setDuration] = useState<180 | 420 | 900>(180);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLobby() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lobbies/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size, durationSeconds: duration }),
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
        <h1 className="text-xl font-bold">Play</h1>
        <Button onClick={() => setCreateOpen(true)}>Create Lobby</Button>
        <Button variant="secondary" onClick={() => setJoinOpen(true)}>
          Join by Code
        </Button>
      </main>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Lobby">
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
