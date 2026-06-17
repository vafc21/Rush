"use client";
import { useEffect, useState } from "react";

type Help = { title: string; how: string[] };

/** Keyed by the GameTabs tab id (note: dragon tower is "tower"). */
const HELP: Record<string, Help> = {
  crash: {
    title: "🚀 Crash",
    how: [
      "A rocket lifts off and its multiplier keeps climbing.",
      "Place a bet, then hit Cash Out before the rocket crashes to win your bet × the multiplier at that moment.",
      "Wait too long and it crashes — you lose the bet. The longer you hold, the bigger the win, the bigger the risk.",
    ],
  },
  dice: {
    title: "🎲 Dice",
    how: [
      "Pick a target number and roll. You win if the roll lands under your target.",
      "Lower targets win less often but pay more; higher targets win often but pay little.",
      "Set your bet, choose the target, and roll.",
    ],
  },
  mines: {
    title: "💣 Mines",
    how: [
      "A 5×5 grid hides mines. Reveal safe tiles to grow your multiplier — each safe tile pays more.",
      "Cash out any time to bank your winnings. Hit a mine and you lose the bet.",
      "More mines means bigger payouts but bigger risk.",
    ],
  },
  limbo: {
    title: "🌙 Limbo",
    how: [
      "Pick a target multiplier, then a random multiplier is drawn.",
      "If the draw is at least your target, you win bet × your target.",
      "Higher targets are rarer to hit but pay much more.",
    ],
  },
  plinko: {
    title: "🎯 Plinko",
    how: [
      "Drop a ball through the pegs — it bounces down into a slot at the bottom.",
      "Edge slots pay the most, center slots the least.",
      "Higher risk spreads the payouts further apart. Each drop is independent.",
    ],
  },
  tower: {
    title: "🐉 Dragon Tower",
    how: [
      "Climb the tower one row at a time. Each row has one dragon; the rest are safe eggs.",
      "Pick an egg to climb and grow your multiplier. Cash out any time.",
      "Pick the dragon and you lose. Harder difficulty = fewer eggs but bigger multipliers.",
    ],
  },
  keno: {
    title: "🎱 Keno",
    how: [
      "Pick up to 10 numbers on the board, then the game draws 10 numbers.",
      "The more of your picks that match the draw, the bigger your payout.",
      "Set your bet and draw.",
    ],
  },
  hilo: {
    title: "🃏 Hilo",
    how: [
      "A card is shown — guess whether the next card is higher or lower.",
      "Each correct guess grows your multiplier. Cash out any time.",
      "Guess wrong and you lose. The odds adjust to the current card.",
    ],
  },
  roulette: {
    title: "🎡 Roulette",
    how: [
      "Place chips on numbers, colors, or groups, then spin.",
      "The ball lands on one number — bets covering it pay out by type.",
      "Straight single numbers pay the most; red/black and even/odd pay the least. Place several bets per spin.",
    ],
  },
  blackjack: {
    title: "♣ Blackjack",
    how: [
      "Get closer to 21 than the dealer without going over.",
      "Hit to draw a card, Stand to hold, Double to double your bet for exactly one more card.",
      "Beating the dealer pays 1:1, a natural blackjack pays 3:2. Go over 21 (bust) and you lose.",
    ],
  },
  baccarat: {
    title: "♠ Baccarat",
    how: [
      "Bet on Player, Banker, or Tie. Both hands are dealt and the one closer to 9 wins.",
      "Player and Banker pay about 1:1; a Tie pays 8:1 but is rare.",
      "No decisions — just pick a side and deal.",
    ],
  },
  wheel: {
    title: "🎯 Wheel",
    how: [
      "Spin a wheel divided into multiplier segments.",
      "Where it stops decides your payout — bet × that segment.",
      "Higher risk wheels have bigger top multipliers but more low or zero segments.",
    ],
  },
  slots: {
    title: "🎰 Slots",
    how: [
      "Spin the reels. Matching symbols on the line pay out, with rarer symbols paying more.",
      "Set your bet and spin. Each spin is independent.",
    ],
  },
  diamonds: {
    title: "💎 Diamonds",
    how: [
      "Seven gems are revealed at once.",
      "You're paid for the biggest group of matching gems — more matches, bigger multiplier.",
      "Set your bet and reveal.",
    ],
  },
  chicken: {
    title: "🐔 Chicken",
    how: [
      "Cross the road one lane at a time. Each lane you clear raises your multiplier.",
      "Cash out any time. But each lane has a chance of a car hitting you — that ends the run with no payout.",
      "Harder difficulty = more risk per lane but faster multiplier growth.",
    ],
  },
  crate: {
    title: "📦 Crate Run",
    how: [
      "Your runner dashes to a crate and smashes it open into a random color-rarity tier.",
      "Each color pays a fixed multiplier on your bet — from a dim Gray loss up to a blazing Gold jackpot.",
      "Pick a difficulty first: Easy softens losses, Hard bites harder but hides a fatter jackpot. Set your bet and run.",
    ],
  },
};

export function GameHelp({ game }: { game: string }) {
  const [open, setOpen] = useState(false);
  const help = HELP[game];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!help) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How to play ${help.title}`}
        title="How to play"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-black text-secondary ring-1 ring-white/10 transition hover:bg-accent/20 hover:text-accent active:scale-95"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-xl bg-panel p-5 shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{help.title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded px-1 text-muted transition hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              How to play
            </p>
            <ul className="space-y-2 text-sm text-secondary">
              {help.how.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 text-accent">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="pt-1 text-center text-[10px] text-muted">
              Play money only · just for fun
            </p>
          </div>
        </div>
      )}
    </>
  );
}
