"use client";
import { useState } from "react";
import { Button } from "./Button";
import { AutoBet } from "./AutoBet";
import { MIN_BET_CENTS, MAX_BET_CENTS } from "@/lib/games/limits";
import { Card } from "@/lib/games/baccarat";
import { pts } from "@/lib/format";

const RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

type Side = "player" | "banker" | "tie";

type Hand = {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: Side;
  won: boolean;
  payoutCents: number;
  betCents: number;
  side: Side;
};

function suitColor(s: string) {
  return s === "♥" || s === "♦" ? "text-red-400" : "text-white";
}

function CardView({ card }: { card: Card }) {
  return (
    <div className="flex h-16 w-11 flex-col items-center justify-center rounded-md border border-panel bg-bg p-1">
      <span className={`text-base font-black tabular-nums ${suitColor(card.suit)}`}>
        {RANK_LABELS[card.rank - 1]}
      </span>
      <span className={`text-sm ${suitColor(card.suit)}`}>{card.suit}</span>
    </div>
  );
}

export function BaccaratGame({
  lobbyId,
  balanceCents,
}: {
  lobbyId: string;
  balanceCents: number;
}) {
  const [betDollars, setBetDollars] = useState("1");
  const [side, setSide] = useState<Side>("player");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hand, setHand] = useState<Hand | null>(null);

  async function play(): Promise<boolean> {
    const betCents = Math.round(parseFloat(betDollars || "0") * 100);
    if (!betCents || betCents < MIN_BET_CENTS) {
      setError(`Min bet ${pts(MIN_BET_CENTS)} pts`);
      return false;
    }
    if (betCents > MAX_BET_CENTS) {
      setError(`Max bet ${pts(MAX_BET_CENTS)} pts`);
      return false;
    }
    if (betCents > balanceCents) {
      setError("Insufficient balance");
      return false;
    }
    setBusy(true);
    setError(null);
    setHand(null);
    const res = await fetch("/api/games/baccarat/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId, betCents, side }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "deal failed");
      return false;
    }
    const data = await res.json();
    setHand({ ...data, betCents, side });
    return true;
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
      <h2 className="text-lg font-bold">♠ Baccarat</h2>

      {hand && (
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted">
              Player <span className="ml-1 tabular-nums text-white">{hand.playerTotal}</span>
            </p>
            <div className="flex gap-1.5">{hand.player.map((c, i) => <CardView key={i} card={c} />)}</div>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted">
              Banker <span className="ml-1 tabular-nums text-white">{hand.bankerTotal}</span>
            </p>
            <div className="flex gap-1.5">{hand.banker.map((c, i) => <CardView key={i} card={c} />)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
              hand.won ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-300"
            }`}
          >
            {hand.winner} won ·{" "}
            {hand.won
              ? `+${pts(hand.payoutCents - hand.betCents)} pts`
              : `-${pts(hand.betCents)} pts`}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {(["player", "banker", "tie"] as const).map((s) => {
          const isActive = side === s;
          const color = s === "tie" ? "brand" : "accent";
          return (
            <button
              key={s}
              onClick={() => {
                setHand(null);
                setSide(s);
              }}
              disabled={busy}
              className={`rounded-md py-2 text-sm font-bold transition ${
                isActive
                  ? color === "brand"
                    ? "bg-brand text-bg"
                    : "bg-accent text-bg"
                  : "bg-bg text-secondary hover:bg-bg/70"
              }`}
            >
              {s === "tie" ? "Tie (8:1)" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          );
        })}
      </div>

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
      <Button onClick={play} disabled={busy} className="w-full">
        {busy ? "Dealing…" : `Deal on ${side}`}
      </Button>
      <AutoBet onPlay={play} pauseMs={300} />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
