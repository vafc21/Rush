import { SignJWT, jwtVerify } from "jose";

export type GuestSession = {
  kind: "guest";
  guestId: string;
  nickname: string;
};

export type UserSession = {
  kind: "user";
  userId: string;
  username: string;
};

export type SessionPayload = GuestSession | UserSession;

const ALG = "HS256";
const ISSUER = "rush";
const EXPIRES_IN = "30d";

function getKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getKey());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getKey(), { issuer: ISSUER });
  if (payload.kind === "guest" && payload.guestId && payload.nickname) {
    return {
      kind: "guest",
      guestId: payload.guestId as string,
      nickname: payload.nickname as string,
    };
  }
  if (payload.kind === "user" && payload.userId && payload.username) {
    return {
      kind: "user",
      userId: payload.userId as string,
      username: payload.username as string,
    };
  }
  throw new Error("Invalid session payload");
}
