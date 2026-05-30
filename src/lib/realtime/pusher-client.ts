"use client";
import { useEffect, useRef } from "react";
import PusherClient, { Channel } from "pusher-js";
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

/**
 * Reference-counted subscriptions per channel name. Multiple components
 * can call useLobbyChannel for the same lobbyId; the channel is only
 * unsubscribed when the last consumer unmounts. This fixes a real bug
 * where switching game tabs would tear down the LobbyPage's realtime
 * feed because both components shared a single channel handle.
 */
const refCounts = new Map<string, number>();
const channels = new Map<string, Channel>();

function acquireChannel(channelName: string): Channel {
  const existing = channels.get(channelName);
  refCounts.set(channelName, (refCounts.get(channelName) ?? 0) + 1);
  if (existing) return existing;
  const channel = getClient().subscribe(channelName);
  channels.set(channelName, channel);
  return channel;
}

function releaseChannel(channelName: string): void {
  const next = (refCounts.get(channelName) ?? 1) - 1;
  if (next <= 0) {
    refCounts.delete(channelName);
    if (channels.has(channelName)) {
      getClient().unsubscribe(channelName);
      channels.delete(channelName);
    }
  } else {
    refCounts.set(channelName, next);
  }
}

export function useLobbyChannel(
  lobbyId: string | null,
  onEvent: (e: LobbyEvent) => void
): void {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!lobbyId) return;
    const channelName = LOBBY_CHANNEL(lobbyId);
    const channel = acquireChannel(channelName);
    const handler = (e: LobbyEvent) => cbRef.current(e);
    channel.bind(LOBBY_EVENT, handler);
    return () => {
      channel.unbind(LOBBY_EVENT, handler);
      releaseChannel(channelName);
    };
  }, [lobbyId]);
}
