import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import { sendMail, mailConfigured } from "./mail.js";
import { revokeAllUserSessions } from "./sessions.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("hex");
}

async function issueAccountToken(
  userId: string,
  type: "reset" | "verify",
  ttlMs: number,
) {
  await prisma.accountToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = newToken();
  await prisma.accountToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

async function consumeAccountToken(rawToken: string, type: "reset" | "verify") {
  const row = await prisma.accountToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) {
    throw Object.assign(new Error("Link inválido ou expirado"), {
      statusCode: 400,
    });
  }
  await prisma.accountToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.userId;
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { ok: true as const };

  const token = await issueAccountToken(user.id, "reset", 1000 * 60 * 60);
  const url = `${config.webPublicUrl}/reset-password?token=${token}`;
  const sent = await sendMail({
    to: user.email,
    subject: "Redefinir senha · Remetum",
    text: `Para criar uma nova senha, abra:\n${url}\n\nO link expira em 1 hora. Se você não pediu isso, ignore este e-mail.`,
  });

  return {
    ok: true as const,
    ...(!config.isProduction || !sent.sent ? { devResetUrl: url } : {}),
  };
}

export async function resetPassword(token: string, password: string) {
  if (password.length < 8) {
    throw Object.assign(new Error("Senha deve ter ao menos 8 caracteres"), {
      statusCode: 400,
    });
  }
  const userId = await consumeAccountToken(token, "reset");
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllUserSessions(userId);
}

export async function sendVerificationEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 404 });
  }
  if (user.emailVerifiedAt) return { ok: true as const, already: true };

  const token = await issueAccountToken(user.id, "verify", 1000 * 60 * 60 * 24);
  const url = `${config.webPublicUrl}/verify-email?token=${token}`;
  const sent = await sendMail({
    to: user.email,
    subject: "Confirme seu e-mail · Remetum",
    text: `Confirme seu e-mail no Remetum:\n${url}\n\nO link expira em 24 horas.`,
  });

  return {
    ok: true as const,
    ...(!config.isProduction || !sent.sent ? { devVerifyUrl: url } : {}),
  };
}

export async function verifyEmailToken(token: string) {
  const userId = await consumeAccountToken(token, "verify");
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < 8) {
    throw Object.assign(new Error("Senha deve ter ao menos 8 caracteres"), {
      statusCode: 400,
    });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 404 });
  }
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) {
    throw Object.assign(new Error("Senha atual incorreta"), { statusCode: 401 });
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllUserSessions(userId);
}

export async function listSessions(userId: string, currentRefresh?: string) {
  const currentHash = currentRefresh ? hashToken(currentRefresh) : null;
  const rows = await prisma.refreshSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((row) => ({
    id: row.id,
    current: Boolean(currentHash && row.tokenHash === currentHash),
    userAgent: row.userAgent,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await prisma.refreshSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    throw Object.assign(new Error("Sessão não encontrada"), { statusCode: 404 });
  }
}

export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 404 });
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    throw Object.assign(new Error("Senha incorreta"), { statusCode: 401 });
  }

  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((m) => m.conversationId);

  await prisma.user.delete({ where: { id: userId } });

  if (conversationIds.length > 0) {
    const leftover = await prisma.conversationParticipant.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: conversationIds } },
      _count: { userId: true },
    });
    const emptyIds = conversationIds.filter(
      (id) => !leftover.some((row) => row.conversationId === id),
    );
    if (emptyIds.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: emptyIds } } });
    }
  }
}

export { mailConfigured };
