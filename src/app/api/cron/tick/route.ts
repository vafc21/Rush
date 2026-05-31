import { NextResponse } from "next/server";
import { GET as endRounds } from "../end-rounds/route";
import { GET as crashTick } from "../crash-tick/route";
import { GET as matchmake } from "../matchmake/route";

/**
 * Consolidated background tick. Vercel's Hobby plan allows at most 2
 * cron jobs and only daily frequency, so instead of three separate
 * per-minute crons we register a single daily one (see vercel.json)
 * that fans out to all three handlers.
 *
 * This is only a background backstop — it cleans up abandoned lobbies
 * (rounds whose players all left, stale matchmaking entries) once a
 * day. Live gameplay is driven entirely by client-side pollers that
 * hit these same endpoints every few seconds while a relevant page is
 * open, so nobody waits on this cron during normal play.
 *
 * On Pro you could instead schedule the three endpoints per-minute and
 * delete this file.
 */
export async function GET() {
  const results = await Promise.allSettled([
    endRounds(),
    crashTick(),
    matchmake(),
  ]);
  const summary = results.map((r) =>
    r.status === "fulfilled" ? "ok" : `error: ${String(r.reason)}`
  );
  return NextResponse.json({
    ran: ["end-rounds", "crash-tick", "matchmake"],
    results: summary,
  });
}
