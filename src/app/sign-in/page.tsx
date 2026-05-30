"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "sign in failed");
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
        <h1 className="text-xl font-bold">Sign in</h1>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">Username</p>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full rounded-md bg-bg px-3 py-2 text-white outline-none ring-1 ring-transparent transition focus:ring-accent/60"
          />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">Password</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full rounded-md bg-bg px-3 py-2 text-white outline-none ring-1 ring-transparent transition focus:ring-accent/60"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-xs text-muted">
          No account?{" "}
          <Link href="/sign-up" className="font-semibold text-brand hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
