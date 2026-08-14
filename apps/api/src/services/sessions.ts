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

export async function issueAuthTokens(userId: string, email: string) {
  const familyId = randomUUID();
  const jti = randomUUID();
  const [accessToken, refresh] = await Promise.all([
    signAccessToken(userId, email),
    signRefreshToken(userId, { jti, familyId }),
  ]);

  const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);
  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashToken(refresh.token),
      familyId,
      expiresAt,
    },
  });

  return { accessToken, refreshToken: refresh.token };
}

export async function rotateRefreshToken(rawToken: string) {
  const payload = await verifyRefreshToken(rawToken);
  const tokenHash = hashToken(rawToken);
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash },
  });

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
      },
    }),
  ]);

  return { accessToken, refreshToken: refresh.token, user };
}

export async function revokeRefreshToken(rawToken: string | undefined) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await prisma.refreshSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
