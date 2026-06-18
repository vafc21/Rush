import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { publishLobby } from "@/lib/realtime/pusher-server";
import { LAST_CHANCE_REBUY_CENTS } from "@/lib/games/lastChance";

/**
 * POST /api/lobbies/[id]/last-chance/flappy
 * Body: { pipes }
 *
 * Banks a Flappy run. The score is reported by the client, so to stop a
 * crafted request from claiming a free jackpot we:
 *   1. Require a server-anchored run (POST .../flappy/start first) and
 *      validate the reported pipes against the elapsed time — you can't have
 *      passed more pipes than the run had time for.
 *   2. Cap the total banked at the Flappy ceiling (4× the standard rebuy), so
 *      even a long legit run stays bounded. (The doubling curve would
 *      otherwise pay astronomically at MAX_PIPES.)
 *   3. Consume the run marker so one run can't be banked twice.
 *
 * You must be busted to flap; banking back above the minimum bet clears the
 * busted flag.
 */

const BASE_CENTS_PER_PIPE = 20;
const PIPES_PER_DOUBLING = 10;
const MAX_PIPES = 200;
// A pipe passes roughly every ~1.3s of real play; gate well under that
// (slower/throttled tabs only ever take longer per pipe) so legit runs are
// never rejected while instant huge claims are.
const MIN_MS_PER_PIPE = 800;
// Banking ceiling. Flappy is the high-skill, high-reward path, so its ceiling
// sits well above the flat Wheel/Mines rebuy (4× = the most lucrative game),
// while staying bounded so even a perfect run is sane within the economy.
const FLAPPY_CAP_CENTS = LAST_CHANCE_REBUY_CENTS * 4;

function bankedFor(pipes: number): number {
  if (pipes <= 0) return 0;
  let cents = 0;
  for (let i = 0; i < Math.min(pipes, MAX_PIPES); i++) {
    const tier = Math.floor(i / PIPES_PER_DOUBLING);
    cents += BASE_CENTS_PER_PIPE * Math.pow(2, tier);
  }
  return Math.min(cents, FLAPPY_CAP_CENTS);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { id: lobbyId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { pipes?: number };
  if (typeof body.pipes !== "number" || body.pipes < 0) {
    return NextResponse.json({ error: "invalid pipes" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const identifier = session.kind === "guest" ? session.nickname : session.username;
  const { data: seat } = await supabase
    .from("lobby_players")
    .select("id, is_busted, balance_cents")
    .eq("lobby_id", lobbyId)
    .eq("nickname", identifier)
    .single();
  if (!seat) {
    return NextResponse.json({ error: "not in lobby" }, { status: 403 });
  }
  if (!seat.is_busted) {
    return NextResponse.json({ error: "not busted" }, { status: 409 });
  }

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("status")
    .eq("id", lobbyId)
    .single();
  if (!lobby || lobby.status !== "active") {
    return NextResponse.json({ error: "round over" }, { status: 409 });
  }

  // Find the player's most recent Flappy bet. It must be an un-banked run
  // marker (phase: "start") — that anchors both that a run actually began
  // and when, so the reported score can be validated against elapsed time.
  const { data: recent } = await supabase
    .from("bets")
    .select("id, placed_at, details")
    .eq("lobby_id", lobbyId)
    .eq("lobby_player_id", seat.id)
    .eq("game", "flappy")
    .order("placed_at", { ascending: false })
    .limit(1);
  const marker = recent?.[0];
  const markerPhase = (marker?.details as { phase?: string } | null)?.phase;
  if (!marker || markerPhase !== "start") {
    return NextResponse.json({ error: "no active run" }, { status: 409 });
  }

  const elapsedMs = Date.now() - new Date(marker.placed_at).getTime();
  const maxPipesByTime = Math.floor(elapsedMs / MIN_MS_PER_PIPE);
  const pipes = Math.max(
    0,
    Math.min(body.pipes, maxPipesByTime, MAX_PIPES)
  );
  const banked = bankedFor(pipes);

  // Consume the run marker so this run can't be banked again.
  await supabase
    .from("bets")
    .update({ payout_cents: banked, details: { phase: "banked", pipes } })
    .eq("id", marker.id);

  if (banked > 0) {
    const { data: newBal } = await supabase.rpc("credit_balance", {
      p_player_id: seat.id,
      p_amount_cents: banked,
    });
    const finalBalance = (newBal as number) ?? seat.balance_cents + banked;
    // Clear busted flag if banking brought us above min bet
    if (finalBalance >= 100) {
      await supabase
        .from("lobby_players")
        .update({ is_busted: false })
        .eq("id", seat.id);
    }
    await publishLobby(lobbyId, {
      type: "balance_update",
      lobbyPlayerId: seat.id,
      balanceCents: finalBalance,
    });
    return NextResponse.json({ banked, newBalanceCents: finalBalance });
  }

  return NextResponse.json({ banked: 0 });
}
