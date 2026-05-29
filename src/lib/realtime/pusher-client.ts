"use client";
import { useEffect, useRef } from "react";
import PusherClient from "pusher-js";
import { LOBBY_CHANNEL, LOBBY_EVENT, LobbyEvent } from "./events";

let singleton: PusherClient | null = null;
function getClient(): PusherClient {
  if (!singleton) {
    singleton = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/pusher/auth",
    });
  }
  return singleton;
}

export function useLobbyChannel(
  lobbyId: string | null,
  onEvent: (e: LobbyEvent) => void
): void {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!lobbyId) return;
    const client = getClient();
    const channel = client.subscribe(LOBBY_CHANNEL(lobbyId));
    const handler = (e: LobbyEvent) => cbRef.current(e);
    channel.bind(LOBBY_EVENT, handler);
    return () => {
      channel.unbind(LOBBY_EVENT, handler);
      client.unsubscribe(LOBBY_CHANNEL(lobbyId));
    };
  }, [lobbyId]);
}
