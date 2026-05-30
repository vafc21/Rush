import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();
  const { data: user } = await supabase
    .from("users")
    .select("id, username, password_hash")
    .eq("username", username)
    .single();

  // Always run bcrypt.compare to avoid leaking which usernames exist via
  // timing. If user is null we compare against a dummy hash and discard.
  const hash = user?.password_hash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) {
    return NextResponse.json(
      { error: "wrong username or password" },
      { status: 401 }
    );
  }

  await setSession({
    kind: "user",
    userId: user.id,
    username: user.username,
  });
  return NextResponse.json({ userId: user.id, username: user.username });
}
