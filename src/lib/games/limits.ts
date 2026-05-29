// Shared bet limits used by both the client UI and the server bet handlers.
// All values in cents.

export const MIN_BET_CENTS = 100; // $1.00
export const MAX_BET_CENTS = 20_000; // $200.00 — keeps players in for ~5+ all-in losses
