import { cookies } from "next/headers";
import { signSession, verifySession, SessionPayload } from "./jwt";

const COOKIE_NAME = "rush_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Response("unauthenticated", { status: 401 });
  return session;
}

export async function setSession(payload: SessionPayload): Promise<void> {
  const store = await cookies();
  const token = await signSession(payload);
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
