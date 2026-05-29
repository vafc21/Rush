import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { setSession } from "@/lib/auth/session";
import { isPlausibleNickname, generateNickname } from "@/lib/lobby/nicknames";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { nickname?: string };
  let nickname = body.nickname?.trim().toLowerCase() ?? "";
  if (!nickname) nickname = generateNickname();
  if (!isPlausibleNickname(nickname)) {
    return NextResponse.json({ error: "invalid nickname" }, { status: 400 });
  }
  const guestId = randomUUID();
  await setSession({ kind: "guest", guestId, nickname });
  return NextResponse.json({ guestId, nickname });
}
