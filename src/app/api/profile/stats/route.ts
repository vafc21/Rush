import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { computeUserStats } from "@/lib/stats/userStats";

/**
 * GET /api/profile/stats
 *
 * Lifetime stats for the signed-in user. Guests are rejected — they don't
 * have persistent stats. (Aggregation lives in computeUserStats, shared
 * with the public per-user endpoint.)
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch (resp) {
    return resp as Response;
  }
  if (session.kind !== "user") {
    return NextResponse.json(
      { error: "guests don't have profile stats" },
      { status: 403 }
    );
  }

  const stats = await computeUserStats(session.userId, session.username);
  return NextResponse.json(stats);
}
