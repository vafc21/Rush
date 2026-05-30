import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { secondsToReachMultiplier } from "@/lib/games/crash";

/**
 * GET /api/games/crash/current?lobbyId=X
 *
 * Returns the most-recent unfinalized Crash round for a lobby, or
 * `{ round: null }` if there isn't one. Used by the client on mount /
 * when entering the waiting phase to catch up on rounds whose
 * `crash_round_start` Pusher event already fired (Pusher doesn't
 * replay history, so a tab opened mid-round would otherwise wait an
 * entire round cycle before seeing one).
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const lobbyId = req.nextUrl.searchParams.get("lobbyId");
  if (!lobbyId) {
    return NextResponse.json({ error: "missing lobbyId" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: latest } = await supabase
    .from("crash_rounds")
    .select("id, start_at, crash_multiplier, crashed_at")
    .eq("lobby_id", lobbyId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return NextResponse.json({ round: null });

  // If finalized AND its aftermath window already elapsed, treat as
  // none-current — the client should keep waiting for the next round.
  const crashMultiplier = Number(latest.crash_multiplier);
  if (latest.crashed_at) {
    const crashedMs = new Date(latest.crashed_at).getTime();
    if (Date.now() > crashedMs + 3000) {
      return NextResponse.json({ round: null });
    }
  } else {
    // If the round's crash time already passed (server hasn't finalized
    // yet — cron lag), the visual round is effectively over; let the
    // client wait for the round_end event instead of starting fresh.
    const startMs = new Date(latest.start_at).getTime();
    const crashAtMs = startMs + secondsToReachMultiplier(crashMultiplier) * 1000;
    if (Date.now() > crashAtMs + 1500) {
      return NextResponse.json({ round: null });
    }
  }

  return NextResponse.json({
    round: {
      id: latest.id,
      startAtMs: new Date(latest.start_at).getTime(),
      crashAt: crashMultiplier,
    },
  });
}
