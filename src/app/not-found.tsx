import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 rotate-45 rounded bg-gradient-to-br from-accent to-brand" />
        <span className="text-2xl font-black tracking-widest">RUSH</span>
      </div>

      <div>
        <p className="text-7xl font-black tabular-nums text-accent drop-shadow-[0_0_24px_rgba(0,231,1,0.35)]">
          404
        </p>
        <p className="mt-3 text-lg font-bold">You busted out of bounds.</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          This page doesn&apos;t exist — maybe the lobby ended, or the link
          was mistyped.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/play"
          className="rounded-md bg-accent px-4 py-2 text-center text-sm font-bold text-bg transition hover:opacity-90 active:scale-[0.98]"
        >
          Back to the tables
        </Link>
        <Link
          href="/"
          className="rounded-md bg-panel px-4 py-2 text-center text-sm font-semibold text-secondary transition hover:bg-panel/80 active:scale-[0.98]"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
