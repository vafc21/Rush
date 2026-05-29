import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const nickname = session.kind === "guest" ? session.nickname : session.username;
  return NextResponse.json({ nickname, kind: session.kind });
}
