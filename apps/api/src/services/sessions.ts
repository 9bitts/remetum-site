import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./tokens.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isMissingSessionTable(err: unknown) {
  const e = err as { code?: string; message?: string };
  return (
    e.code === "P2021" ||
    e.code === "P2010" ||
    /refresh_sessions|does not exist|no such table/i.test(e.message ?? "")
  );
}

export async function issueAuthTokens(
  userId: string,
  email: string,
  meta?: { userAgent?: string | null; ip?: string | null },
) {
  const familyId = randomUUID();
  const jti = randomUUID();
  const [accessToken, refresh] = await Promise.all([
    signAccessToken(userId, email),
    signRefreshToken(userId, { jti, familyId }),
  ]);

  const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);
  try {
    await prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: hashToken(refresh.token),
        familyId,
        expiresAt,
        userAgent: meta?.userAgent?.slice(0, 240) ?? null,
        ip: meta?.ip?.slice(0, 64) ?? null,
      },
    });
  } catch (err) {
    if (!isMissingSessionTable(err)) throw err;
    console.error(
      "[auth] refresh_sessions table missing — issuing JWT without server session store",
    );
  }

  return { accessToken, refreshToken: refresh.token };
}

export async function rotateRefreshToken(rawToken: string) {
  const payload = await verifyRefreshToken(rawToken);
  const tokenHash = hashToken(rawToken);

  let session: {
    id: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    userAgent: string | null;
    ip: string | null;
  } | null = null;

  try {
    session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
    });
  } catch (err) {
    if (!isMissingSessionTable(err)) throw err;
    // Legacy path: trust signed refresh JWT until the table exists.
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 401 });
    }
    const jti = randomUUID();
    const familyId = payload.familyId ?? randomUUID();
    const [accessToken, refresh] = await Promise.all([
      signAccessToken(user.id, user.email),
      signRefreshToken(user.id, { jti, familyId }),
    ]);
    return { accessToken, refreshToken: refresh.token, user };
  }

  if (!session || session.userId !== payload.sub) {
    if (payload.familyId) {
      await prisma.refreshSession.updateMany({
        where: { familyId: payload.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw Object.assign(new Error("Refresh token inválido"), { statusCode: 401 });
  }

  if (session.revokedAt || session.expiresAt < new Date()) {
    await prisma.refreshSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw Object.assign(new Error("Refresh token inválido"), { statusCode: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 401 });
  }

  const jti = randomUUID();
  const [accessToken, refresh] = await Promise.all([
    signAccessToken(user.id, user.email),
    signRefreshToken(user.id, { jti, familyId: session.familyId }),
  ]);

  const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);
  await prisma.$transaction([
    prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh.token),
        familyId: session.familyId,
        expiresAt,
        userAgent: session.userAgent,
        ip: session.ip,
      },
    }),
  ]);

  return { accessToken, refreshToken: refresh.token, user };
}

export async function revokeRefreshToken(rawToken: string | undefined) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  try {
    await prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch (err) {
    if (!isMissingSessionTable(err)) throw err;
  }
}

export async function revokeAllUserSessions(userId: string) {
  try {
    await prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch (err) {
    if (!isMissingSessionTable(err)) throw err;
  }
}
