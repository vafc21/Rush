import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { computeUserStats } from "@/lib/stats/userStats";

/**
 * GET /api/users/[username]/stats
 *
 * Public lifetime stats for a registered user — shown when you click a
 * "Member" in the leaderboard. Any authenticated session (guest or user)
 * may view, but only registered usernames resolve: guests have no row in
 * `users`, so the lookup 404s for them.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    await requireSession();
  } catch (resp) {
    return resp as Response;
  }

  const { username: raw } = await context.params;
  // Usernames are stored lowercased at signup; normalise the same way.
  const username = decodeURIComponent(raw).trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "missing username" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: user } = await supabase
    .from("users")
    .select("id, username")
    .eq("username", username)
    .single();
  if (!user) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }

  const stats = await computeUserStats(user.id, user.username);
  return NextResponse.json(stats);
}
