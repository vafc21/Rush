/**
 * Accent ring spinner used for loading states across the app.
 * Pure CSS animation (Tailwind's `animate-spin`) — safe in server or
 * client components. Size/colour are overridable via `className`.
 */
export function Spinner({
  className = "h-8 w-8",
}: {
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-spin rounded-full border-2 border-accent border-t-transparent ${className}`}
    />
  );
}

/**
 * Centred full-area loading state — a spinner with an optional label.
 * Drop-in replacement for plain "Loading…" text screens.
 */
export function LoadingScreen({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[60vh] flex-col items-center justify-center gap-4 ${className}`}
    >
      <Spinner className="h-10 w-10" />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
