"use client";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { WinBurst } from "./WinBurst";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Card, evaluate } from "@/lib/games/blackjack";
import { pts } from "@/lib/format";

const RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

type Game = {
  betId: string;
  betCents: number;
  player: Card[];
  dealer?: Card[];      // full when settled
  dealerVisible: Card;  // shown while player is acting
  status: "player_turn" | "settled";
  result?: string;
  payoutCents?: number;
  doubled: boolean;
};

function suitColor(s: string) {
  return s === "♥" || s === "♦" ? "text-red-400" : "text-white";
}

function CardView({
  card,
  hidden,
  index = 0,
}: {
  card?: Card;
  hidden?: boolean;
  index?: number;
}) {
  // Stagger the opening deal but cap it so single-card hits don't lag.
  const dealStyle = {
    animation: "rush-deal 320ms ease-out both",
    animationDelay: `${Math.min(index, 2) * 80}ms`,
  };
  if (hidden || !card) {
    return (
      <div
        className="flex h-20 w-14 items-center justify-center rounded-md border border-panel bg-bg/60"
        style={dealStyle}
      >
        <div className="h-12 w-10 rounded bg-gradient-to-br from-brand to-accent opacity-60" />
      </div>
    );
  }
  return (
    <div
      className="flex h-20 w-14 flex-col items-center justify-center rounded-md border border-panel bg-bg p-1"
      style={dealStyle}
    >
      <span className={`text-xl font-black tabular-nums ${suitColor(card.suit)}`}>
        {RANK_LABELS[card.rank - 1]}
      </span>
      <span className={`text-lg ${suitColor(card.suit)}`}>{card.suit}</span>
    </div>
  );
}

export function BlackjackGame({
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
  // Win/loss panel is shown only after the hand has settled AND the
  // dealer's cards have finished dealing in — not before.
  const [revealed, setRevealed] = useState(false);

  const settled = game?.status === "settled";
  useEffect(() => {
    if (!settled) {
      setRevealed(false);
      return;
    }
    const t = setTimeout(() => setRevealed(true), 600);
    return () => clearTimeout(t);
  }, [settled, game?.betId]);

  async function start() {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Min bet ${pts(MIN_BET_CENTS)} pts`);
      return;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet ${pts(MAX_BET_CENTS)} pts`);
      return;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/blackjack/start", {
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
    const data = await res.json();
    setGame({
      betId: data.betId,
      betCents,
      player: data.player,
      dealerVisible: data.dealerVisible,
      dealer: data.dealer,
      status: data.status,
      result: data.result,
      payoutCents: data.payoutCents,
      doubled: false,
    });
  }

  async function act(action: "hit" | "stand" | "double") {
    if (!game || game.status !== "player_turn" || busy) return;
    setBusy(true);
    const res = await fetch("/api/games/blackjack/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId: game.betId, action }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "action failed");
      return;
    }
    const data = await res.json();
    setGame((g) =>
      g
        ? {
            ...g,
            player: data.player,
            dealer: data.dealer,
            status: data.status,
            result: data.result,
            payoutCents: data.payoutCents,
            doubled: action === "double" ? true : g.doubled,
          }
        : g
    );
  }

  function reset() {
    setGame(null);
    setError(null);
  }

  const playerEval = game ? evaluate(game.player) : null;
  const dealerEval = game?.dealer ? evaluate(game.dealer) : null;
  const effectiveBet = game ? game.betCents * (game.doubled ? 2 : 1) : 0;
  const won = game ? (game.payoutCents ?? 0) > effectiveBet : false;

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">♣ Blackjack</h2>

      {!game && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Bet</span>
              <span className="text-[10px]">Max {pts(MAX_BET_CENTS)} pts</span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md bg-bg px-3 py-2 tabular-nums text-white outline-none ring-1 ring-transparent focus:ring-accent/60"
                type="number"
                min={MIN_BET_CENTS / 100}
                max={MAX_BET_CENTS / 100}
                step="0.50"
                value={betDollars}
                disabled={busy}
                onChange={(e) => setBetDollars(e.target.value)}
              />
              <button
                onClick={() =>
                  setBetDollars((Math.min(balanceCents, MAX_BET_CENTS) / 100).toFixed(2))
                }
                disabled={busy}
                className="rounded-md bg-brand/15 px-3 text-xs font-bold text-brand hover:bg-brand/25 active:scale-95"
              >
                Max
              </button>
            </div>
          </div>
          <Button onClick={start} disabled={busy} className="w-full">
            {busy ? "Dealing…" : "Deal"}
          </Button>
        </div>
      )}

      {game && (
        <div className="relative space-y-4">
          <WinBurst
            trigger={
              revealed && won ? `${game.result}-${game.betId}` : false
            }
            intensity={game.result === "player_blackjack" ? 1.8 : 1}
          />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted">
              Dealer{" "}
              {dealerEval && (
                <span className="ml-1 tabular-nums text-white">{dealerEval.total}</span>
              )}
            </p>
            <div className="flex gap-1.5">
              <CardView card={game.dealerVisible} index={0} />
              {game.dealer
                ? game.dealer
                    .slice(1)
                    .map((c, i) => <CardView key={i} card={c} index={i + 1} />)
                : <CardView hidden index={1} />}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted">
              You{" "}
              {playerEval && (
                <span className="ml-1 tabular-nums text-white">{playerEval.total}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {game.player.map((c, i) => <CardView key={i} card={c} index={i} />)}
            </div>
          </div>

          {game.status === "player_turn" && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => act("hit")}
                disabled={busy}
                className="rounded-md bg-accent py-2 text-sm font-bold text-bg hover:opacity-90 active:scale-95"
              >
                Hit
              </button>
              <button
                onClick={() => act("stand")}
                disabled={busy}
                className="rounded-md bg-bg py-2 text-sm font-bold text-white hover:bg-bg/70 active:scale-95"
              >
                Stand
              </button>
              <button
                onClick={() => act("double")}
                disabled={busy || game.player.length !== 2}
                className="rounded-md bg-brand py-2 text-sm font-bold text-bg hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                Double
              </button>
            </div>
          )}

          {game.status === "settled" && revealed && (
            <div
              className={`space-y-2 rounded-md px-3 py-3 text-center text-sm font-bold ${
                (game.payoutCents ?? 0) >= game.betCents * (game.doubled ? 2 : 1)
                  ? "bg-accent/10 text-accent"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              <p className="text-lg">{game.result?.replaceAll("_", " ")}</p>
              <p>
                {(game.payoutCents ?? 0) >= game.betCents * (game.doubled ? 2 : 1)
                  ? "+"
                  : ""}
                {pts((game.payoutCents ?? 0) - game.betCents * (game.doubled ? 2 : 1))} pts
              </p>
              <button
                onClick={reset}
                className="text-xs font-semibold text-muted underline hover:text-white"
              >
                Deal again
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
