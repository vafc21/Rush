import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { getCallerPlayerId } from "@/lib/lobby/host";

/**
 * POST /api/lobbies/[id]/leave
 *
 * Removes the caller's seat — but only while the lobby is still in the
 * "waiting" room. Because the host is simply the first-joined player,
 * deleting the host's row auto-promotes the next-oldest player to host
 * (they'll see the Start / Add CPU / Kick controls once the player_left
 * event lands).
 *
 * During an active or ended round we DON'T delete the row — the player
 * is a competitor with a balance and final standing, so leaving just
 * means navigating away client-side. We return ok in all cases so the
 * client can always proceed to the hub.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const supabase = getServiceSupabase();

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== "waiting") {
    // Nothing to do — keep the seat (active round) or lobby is gone.
    return NextResponse.json({ ok: true, removed: false });
  }

  const callerId = await getCallerPlayerId(supabase, lobbyId, session);
  if (!callerId) {
    return NextResponse.json({ ok: true, removed: false });
  }

  const { error: delErr } = await supabase
    .from("lobby_players")
    .delete()
    .eq("id", callerId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await publishLobby(lobbyId, {
    type: "player_left",
    lobbyPlayerId: callerId,
  });

  return NextResponse.json({ ok: true, removed: true });
}
