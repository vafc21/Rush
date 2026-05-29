export const LOBBY_CHANNEL = (lobbyId: string) => `private-lobby-${lobbyId}`;
export const USER_CHANNEL = (lobbyPlayerId: string) =>
  `private-user-${lobbyPlayerId}`;

export type LobbyEvent =
  | { type: "player_joined"; lobbyPlayerId: string; nickname: string; isBot: boolean }
  | { type: "player_left"; lobbyPlayerId: string }
  | { type: "lobby_starting"; lobbyId: string; startsAt: number }
  | { type: "lobby_active"; lobbyId: string; endsAt: number }
  | { type: "balance_update"; lobbyPlayerId: string; balanceCents: number }
  | { type: "player_busted"; lobbyPlayerId: string }
  | { type: "lobby_ended"; lobbyId: string; finalRanks: { lobbyPlayerId: string; rank: number; balanceCents: number }[] };

export const LOBBY_EVENT = "lobby-event";
