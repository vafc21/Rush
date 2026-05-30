"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";

export default function SignUpPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (password !== confirm) {
      setError("passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "could not create account");
      return;
    }
    router.push("/play");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Link
        href="/"
        className="flex items-center gap-2 transition-opacity hover:opacity-80"
      >
        <div className="h-5 w-5 rotate-45 rounded bg-gradient-to-br from-accent to-brand" />
        <span className="text-2xl font-black tracking-widest">RUSH</span>
      </Link>
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-panel p-6">
        <h1 className="text-xl font-bold">Create account</h1>
        <p className="text-xs text-muted">
          Saves your stats across games. No email needed — but that also means
          there&apos;s no password recovery, so pick something you&apos;ll
          remember.
        </p>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">Username</p>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            className="w-full rounded-md bg-bg px-3 py-2 text-white outline-none ring-1 ring-transparent transition focus:ring-accent/60"
          />
          <p className="mt-1 text-[10px] text-muted">
            3–20 chars, letters/numbers/underscores
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">Password</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-md bg-bg px-3 py-2 text-white outline-none ring-1 ring-transparent transition focus:ring-accent/60"
          />
          <p className="mt-1 text-[10px] text-muted">at least 6 characters</p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">
            Confirm password
          </p>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full rounded-md bg-bg px-3 py-2 text-white outline-none ring-1 ring-transparent transition focus:ring-accent/60"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted">
          Already have one?{" "}
          <Link href="/sign-in" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
