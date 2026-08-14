import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  typ: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  typ: "refresh";
  familyId?: string;
  jti?: string;
};

const accessSecret = new TextEncoder().encode(config.jwtSecret);
const refreshSecret = new TextEncoder().encode(config.jwtRefreshSecret);

export async function signAccessToken(userId: string, email: string) {
  return new SignJWT({ email, typ: "access" } satisfies Omit<AccessTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(accessSecret);
}

export async function signRefreshToken(
  userId: string,
  opts: { jti: string; familyId: string },
) {
  const token = await new SignJWT({
    typ: "refresh",
    familyId: opts.familyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(opts.jti)
    .setIssuedAt()
    .setExpirationTime(`${config.refreshTokenTtlSeconds}s`)
    .sign(refreshSecret);

  return { token, jti: opts.jti, familyId: opts.familyId };
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessSecret);
  if (payload.typ !== "access" || typeof payload.sub !== "string") {
    throw new Error("Invalid access token");
  }
  return {
    sub: payload.sub,
    email: String(payload.email ?? ""),
    typ: "access" as const,
  };
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshSecret);
  if (payload.typ !== "refresh" || typeof payload.sub !== "string") {
    throw new Error("Invalid refresh token");
  }
  return {
    sub: payload.sub,
    typ: "refresh" as const,
    familyId: typeof payload.familyId === "string" ? payload.familyId : undefined,
    jti: typeof payload.jti === "string" ? payload.jti : undefined,
  };
}
