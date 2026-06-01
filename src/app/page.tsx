"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Footer } from "@/components/Footer";

export default function Landing() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function playAsGuest() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.trim().toLowerCase() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }
    router.push("/play");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-10 p-6">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 rotate-45 rounded bg-gradient-to-br from-accent to-brand" />
        <h1 className="text-4xl font-black tracking-widest">RUSH</h1>
      </div>
      <p className="max-w-md text-center text-secondary">
        Beat your friends at fake-money casino games. 1,000 points each,
        X minutes, highest balance wins.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/sign-in"
          className="rounded-md bg-accent px-4 py-2 text-center text-sm font-bold text-bg transition hover:opacity-90 active:scale-[0.98]"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="rounded-md bg-brand px-4 py-2 text-center text-sm font-bold text-bg transition hover:opacity-90 active:scale-[0.98]"
        >
          Create account
        </Link>
        <Button
          variant="secondary"
          onClick={() => setOpen(true)}
          className="w-full"
        >
          Play as Guest
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Pick a nickname">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Leave blank for a random one"
            className="rounded-md bg-bg px-3 py-2 text-white outline-none placeholder:text-muted"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
          />
          <p className="text-xs text-muted">Letters, numbers, underscores. 3–20 chars.</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button onClick={playAsGuest} disabled={busy}>
            {busy ? "Joining…" : "Continue"}
          </Button>
        </div>
      </Modal>
      </main>
      <Footer />
    </div>
  );
}
