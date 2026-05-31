/**
 * Small disclaimer + copyright footer for the public surfaces (landing,
 * hub, auth). Rush uses play money only — this makes the no-real-money,
 * not-gambling nature explicit. Kept off the in-game lobby so it doesn't
 * clutter gameplay.
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mx-auto max-w-md px-6 pb-8 pt-6 text-center text-[11px] leading-relaxed text-muted">
      <p>
        Rush is a game for fun —{" "}
        <span className="text-secondary">play money only</span>. No real
        money, no deposits, no payouts, no gambling. Ages 13+.
      </p>
      <p className="mt-1.5">© {year} Rush. All rights reserved.</p>
    </footer>
  );
}
