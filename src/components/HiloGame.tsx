"use client";
import { useState } from "react";
import { Button } from "./Button";
import { WinBurst } from "./WinBurst";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Card, Direction } from "@/lib/games/hilo";
import { pts } from "@/lib/format";

const RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

type Game = {
  betId: string;
  betCents: number;
  startCard: Card;
  currentCard: Card;
  rawMultiplier: number;
  cashoutMultiplier: number;
  status: "playing" | "lost" | "cashed";
  lastDrawn?: Card;
};

function rankLabel(rank: number) {
  return RANK_LABELS[rank - 1] ?? "?";
}

function suitColor(suit: string) {
  return suit === "♥" || suit === "♦" ? "text-red-400" : "text-white";
}

function CardView({
  card,
  size = "lg",
  flipKey,
}: {
  card: Card;
  size?: "lg" | "sm";
  /** Change this to retrigger the flip animation when the card changes. */
  flipKey?: string | number;
}) {
  const dim = size === "lg" ? "h-32 w-24 text-4xl" : "h-16 w-12 text-xl";
  return (
    <div
      key={flipKey}
      className={`flex flex-col items-center justify-center rounded-lg bg-bg p-2 font-black ${dim} border border-panel`}
      style={{
        animation: flipKey !== undefined ? "rush-flip 500ms ease-out" : undefined,
        transformStyle: "preserve-3d",
      }}
    >
      <span className={`tabular-nums ${suitColor(card.suit)}`}>
        {rankLabel(card.rank)}
      </span>
      <span className={`text-2xl ${suitColor(card.suit)}`}>{card.suit}</span>
    </div>
  );
}

export function HiloGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPayout, setLastPayout] = useState<number | null>(null);

  async function start() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Minimum bet is ${pts(MIN_BET_CENTS)} pts`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet is ${pts(MAX_BET_CENTS)} pts per game`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    setLastPayout(null);
    const res = await fetch("/api/games/hilo/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "start failed");
      return;
    }
    const data = (await res.json()) as { betId: string; startCard: Card };
    setGame({
      betId: data.betId,
      betCents,
      startCard: data.startCard,
      currentCard: data.startCard,
      rawMultiplier: 1,
      cashoutMultiplier: 0,
      status: "playing",
    });
  }

  async function guess(direction: Direction) {
    if (!game || game.status !== "playing" || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/hilo/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId, direction }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "guess failed");
      return;
    }
    const data = (await res.json()) as {
      correct: boolean;
      drawn: Card;
      currentCard: Card;
      rawMultiplier: number;
      cashoutMultiplier: number;
      status: "active" | "lost";
    };
    setGame((g) =>
      g
        ? {
            ...g,
            currentCard: data.currentCard,
            rawMultiplier: data.rawMultiplier,
            cashoutMultiplier: data.cashoutMultiplier,
            status: data.status === "lost" ? "lost" : "playing",
            lastDrawn: data.drawn,
          }
        : g
    );
  }

  async function cashout() {
    if (!game || game.status !== "playing") return;
    setBusy(true);
    const res = await fetch("/api/games/hilo/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "cashout failed");
      return;
    }
    const data = (await res.json()) as { payoutCents: number; multiplier: number };
    setLastPayout(data.payoutCents);
    setGame((g) => (g ? { ...g, status: "cashed", cashoutMultiplier: data.multiplier } : g));
  }

  function reset() {
    setGame(null);
    setError(null);
    setLastPayout(null);
  }

  const canGuessHigher = game ? game.currentCard.rank < 13 : false;
  const canGuessLower = game ? game.currentCard.rank > 1 : false;
  const potentialPayout = game
    ? Math.floor(game.betCents * game.cashoutMultiplier)
    : 0;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">🃏 Hilo</h2>
        {game && game.status === "playing" && game.rawMultiplier > 1 && (
          <div className="text-xs text-muted">
            Multi{" "}
            <span className="font-bold tabular-nums text-accent">
              {game.cashoutMultiplier.toFixed(2)}x
            </span>{" "}
            ·{" "}
            <span className="tabular-nums text-white">
              {pts(potentialPayout)} pts
            </span>
          </div>
        )}
      </div>

      {!game && (
        <div className="space-y-4">
          <div className="flex h-32 items-center justify-center rounded-md bg-bg/30 text-sm text-muted">
            Place a bet to draw your first card
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted">Bet</p>
              <p className="text-[10px] text-muted">
                Max{" "}
                <span className="tabular-nums text-secondary">
                  {pts(MAX_BET_CENTS)} pts
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60 transition"
                type="number"
                min={MIN_BET_CENTS / 100}
                max={MAX_BET_CENTS / 100}
                step="0.50"
                value={betDollars}
                disabled={busy}
                onChange={(e) => setBetDollars(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setBetDollars(
                    (Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2)
                  )
                }
                className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand transition hover:bg-brand/25 active:scale-95 disabled:opacity-50"
              >
                Max
              </button>
            </div>
          </div>
          <Button onClick={start} disabled={busy} className="w-full">
            {busy ? "Drawing…" : "Deal"}
          </Button>
        </div>
      )}

      {game && (
        <div className="space-y-4">
          <div className="relative flex items-center justify-center gap-4">
            <WinBurst
              trigger={
                game.status === "cashed"
                  ? `cashed-${game.cashoutMultiplier}`
                  : false
              }
              intensity={game.cashoutMultiplier >= 5 ? 1.8 : 1.1}
            />
            <CardView
              card={game.currentCard}
              flipKey={`${game.currentCard.rank}-${game.currentCard.suit}-${game.cashoutMultiplier}`}
            />
          </div>

          {game.status === "playing" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => guess("higher")}
                disabled={busy || !canGuessHigher}
                className="rounded-md bg-accent/15 py-3 text-sm font-bold text-accent transition hover:bg-accent/25 active:scale-95 disabled:opacity-40"
              >
                ▲ Higher
              </button>
              <button
                onClick={() => guess("lower")}
                disabled={busy || !canGuessLower}
                className="rounded-md bg-red-500/15 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/25 active:scale-95 disabled:opacity-40"
              >
                ▼ Lower
              </button>
            </div>
          )}

          {game.status === "playing" && game.rawMultiplier > 1 && (
            <Button onClick={cashout} disabled={busy} className="w-full">
              Cash Out {pts(potentialPayout)} pts
            </Button>
          )}

          {game.status === "lost" && (
            <div className="space-y-2 rounded-md bg-red-500/10 px-3 py-3 text-center">
              <p className="text-2xl font-black text-red-300">Wrong</p>
              <p className="text-sm text-red-300">
                Lost {pts(game.betCents)} pts
              </p>
              <button
                onClick={reset}
                className="text-xs font-semibold text-muted underline hover:text-white"
              >
                Play again
              </button>
            </div>
          )}
          {game.status === "cashed" && lastPayout !== null && (
            <div className="space-y-2 rounded-md bg-accent/10 px-3 py-3 text-center">
              <p className="text-2xl font-black text-accent">
                +{pts(lastPayout)} pts
              </p>
              <p className="text-sm text-accent/80">
                Cashed at {game.cashoutMultiplier.toFixed(2)}x
              </p>
              <button
                onClick={reset}
                className="text-xs font-semibold text-muted underline hover:text-white"
              >
                Play again
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
