// Shared bet limits used by both the client UI and the server bet handlers.
// All values in cents.

export const MIN_BET_CENTS = 100; // $1.00
export const MAX_BET_CENTS = 20_000; // $200.00 — keeps players in for ~5+ all-in losses

// Balance (in cents) a busted player must reach to LEAVE Last Chance and rejoin
// the main game. You ENTER Last Chance by going broke (balance < MIN_BET_CENTS),
// but you don't leave the moment you can afford the $1 min bet again — you stay
// in the broke games (Wheel, Mines, Flappy) until you've climbed back to $500.
// Wheel/Mines wins rebuy straight to this amount; a Flappy run banks toward it.
export const LAST_CHANCE_EXIT_CENTS = 50_000; // $500.00
