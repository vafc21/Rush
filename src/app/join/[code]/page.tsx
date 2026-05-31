"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { TopBar } from "@/components/TopBar";

/**
 * Deep-link join page. Friends open /join/<CODE> (shared from a lobby's
 * "Copy link" button). If they already have a session we auto-join and
 * redirect to the lobby. If they don't, we show a quick guest nickname
 * form, create a guest session, then join — all on this one page.
 */
export default function JoinByLink() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const normalizedCode = (code ?? "").toUpperCase();

  const [phase, setPhase] = useState<"checking" | "guest" | "joining" | "error">(
    "checking"
  );
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const triedRef = useRef(false);

  const join = useCallback(async (): Promise<boolean> => {
    setPhase("joining");
    setError(null);
    const res = await fetch("/api/lobbies/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizedCode }),
    });
    if (res.ok) {
      const { lobbyId } = await res.json();
      router.replace(`/lobby/${lobbyId}`);
      return true;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Could not join this lobby");
    setPhase("error");
    return false;
  }, [normalizedCode, router]);

  // On mount: if signed in, auto-join. Otherwise show the guest form.
  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;
    (async () => {
      const who = await fetch("/api/auth/whoami");
      if (who.ok) {
        await join();
      } else {
        setPhase("guest");
      }
    })();
  }, [join]);

  async function continueAsGuest() {
    setPhase("joining");
    setError(null);
    const res = await fetch("/api/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.trim().toLowerCase() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create a guest");
      setPhase("guest");
      return;
    }
    await join();
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
        <div className="rounded-lg bg-panel p-6 text-center">
          <p className="text-xs uppercase tracking-wider text-muted">
            Joining lobby
          </p>
          <p className="mt-1 font-mono text-3xl text-brand">{normalizedCode}</p>

          {(phase === "checking" || phase === "joining") && (
            <p className="mt-4 text-sm text-muted">Connecting…</p>
          )}

          {phase === "guest" && (
            <div className="mt-5 flex flex-col gap-3 text-left">
              <label className="text-xs uppercase tracking-wider text-muted">
                Pick a nickname
              </label>
              <input
                type="text"
                placeholder="leave blank for a random one"
                className="rounded-md bg-bg px-3 py-2 text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
                value={nickname}
                maxLength={24}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") continueAsGuest();
                }}
              />
              <Button onClick={continueAsGuest}>Join as Guest</Button>
              <p className="text-center text-[11px] text-muted">
                Have an account?{" "}
                <Link href="/sign-in" className="text-brand hover:underline">
                  Sign in
                </Link>{" "}
                first, then reopen the link.
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="mt-5 flex flex-col gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <Link
                href="/play"
                className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-bg transition hover:opacity-90"
              >
                Back to Hub
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
