import Pusher from "pusher";
import type { LobbyEvent } from "./events";
import { LOBBY_CHANNEL, LOBBY_EVENT } from "./events";

let client: Pusher | null = null;

function get(): Pusher {
  if (!client) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!appId || !key || !secret || !cluster) {
      throw new Error("Pusher env vars missing");
    }
    client = new Pusher({ appId, key, secret, cluster, useTLS: true });
  }
  return client;
}

export async function publishLobby(lobbyId: string, event: LobbyEvent): Promise<void> {
  await get().trigger(LOBBY_CHANNEL(lobbyId), LOBBY_EVENT, event);
}

export function authorizeChannel(socketId: string, channel: string): {
  auth: string;
} {
  return get().authorizeChannel(socketId, channel);
}
