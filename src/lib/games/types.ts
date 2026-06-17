export type GameType =
  | "crash"
  | "dice"
  | "mines"
  | "limbo"
  | "dragon_tower"
  | "plinko"
  | "keno"
  | "hilo"
  | "roulette"
  | "blackjack"
  | "baccarat"
  | "wheel"
  | "slots"
  | "diamonds"
  | "chicken"
  | "crate_run"
  | "last_chance_mines"
  | "last_chance_wheel"
  | "flappy";

export type BetOutcome = {
  payoutCents: number;        // 0 on loss, > 0 on win
  details: Record<string, unknown>;
};
