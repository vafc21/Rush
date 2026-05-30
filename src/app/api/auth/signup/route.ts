import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSession } from "@/lib/auth/session";
import { getServiceSupabase } from "@/lib/db/supabase";
import { isPlausibleNickname } from "@/lib/lobby/nicknames";

const MIN_PASSWORD_LENGTH = 6;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!isPlausibleNickname(username)) {
    return NextResponse.json(
      { error: "username must be 3-20 letters / numbers / underscores" },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();

  const passwordHash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from("users")
    .insert({ username, password_hash: passwordHash })
    .select("id, username")
    .single();
  if (error || !user) {
    // 23505 = unique_violation on username
    const taken = error?.code === "23505";
    return NextResponse.json(
      { error: taken ? "that username is taken" : (error?.message ?? "could not create account") },
      { status: taken ? 409 : 500 }
    );
  }

  await setSession({
    kind: "user",
    userId: user.id,
    username: user.username,
  });
  return NextResponse.json({ userId: user.id, username: user.username });
}
