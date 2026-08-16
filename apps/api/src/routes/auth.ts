import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import {
  issueAuthTokens,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/sessions.js";
import { setAuthCookies, clearAuthCookies } from "../lib/cookies.js";
import { toAuthUser } from "../lib/serialize.js";
import { config } from "../config.js";
import { allocateHandle, assertHandle, ensureUserHandle } from "../services/handles.js";
import {
  changePassword,
  deleteAccount,
  listSessions,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  sendVerificationEmail,
  verifyEmailToken,
} from "../services/account.js";

type RegisterBody = {
  name?: string;
  email?: string;
  password?: string;
  handle?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validatePassword(password: string) {
  return password.length >= 8;
}

function isValidEmail(email: string) {
  return EMAIL_RE.test(email) && email.length <= 254;
}

function requestMeta(request: { headers: { "user-agent"?: string }; ip: string }) {
  return {
    userAgent: request.headers["user-agent"] ?? null,
    ip: request.ip ?? null,
  };
}

async function sendError(
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  err: unknown,
) {
  const e = err as { statusCode?: number; message: string };
  return reply.code(e.statusCode ?? 500).send({ error: e.message || "Erro interno" });
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>(
    "/auth/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const name = request.body?.name?.trim() ?? "";
        const emailRaw = request.body?.email ?? "";
        const password = request.body?.password ?? "";

        if (name.length < 2 || name.length > 80) {
          return reply
            .code(400)
            .send({ error: "Nome deve ter entre 2 e 80 caracteres" });
        }
        if (!isValidEmail(emailRaw)) {
          return reply.code(400).send({ error: "E-mail inválido" });
        }
        if (!validatePassword(password)) {
          return reply
            .code(400)
            .send({ error: "Senha deve ter ao menos 8 caracteres" });
        }

        const email = normalizeEmail(emailRaw);
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          return reply
            .code(409)
            .send({ error: "Não foi possível criar a conta com estes dados" });
        }

        const requestedHandle = request.body?.handle?.trim();
        let handle: string;
        if (requestedHandle) {
          handle = assertHandle(requestedHandle);
          const taken = await prisma.user.findUnique({ where: { handle } });
          if (taken) {
            return reply.code(409).send({ error: "Este apelido já está em uso" });
          }
        } else {
          handle = await allocateHandle(name);
        }
        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
          data: {
            name,
            email,
            passwordHash,
            handle,
          },
        });

        const tokens = await issueAuthTokens(
          user.id,
          user.email,
          requestMeta(request),
        );
        setAuthCookies(reply, tokens);
        void sendVerificationEmail(user.id).catch((err) => {
          request.log.error(err);
        });

        return reply.code(201).send({ user: toAuthUser(user) });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status && status < 500) {
          return reply.code(status).send({ error: (err as Error).message });
        }
        request.log.error(err);
        return reply.code(500).send({ error: "Erro interno no registro" });
      }
    },
  );

  app.post<{ Body: LoginBody }>(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const emailRaw = request.body?.email ?? "";
        const password = request.body?.password ?? "";

        if (!emailRaw || !password) {
          return reply
            .code(400)
            .send({ error: "E-mail e senha são obrigatórios" });
        }

        const email = normalizeEmail(emailRaw);
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          return reply.code(401).send({ error: "Credenciais inválidas" });
        }

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) {
          return reply.code(401).send({ error: "Credenciais inválidas" });
        }

        const withHandle = await ensureUserHandle(user);
        const tokens = await issueAuthTokens(
          withHandle.id,
          withHandle.email,
          requestMeta(request),
        );
        setAuthCookies(reply, tokens);

        return { user: toAuthUser(withHandle) };
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: "Erro interno no login" });
      }
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const refresh = request.cookies[config.cookie.refresh];
    await revokeRefreshToken(refresh);
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.post(
    "/auth/refresh",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const token = request.cookies[config.cookie.refresh];
      if (!token) {
        return reply.code(401).send({ error: "Refresh token ausente" });
      }

      try {
        const rotated = await rotateRefreshToken(token);
        const withHandle = await ensureUserHandle(rotated.user);
        setAuthCookies(reply, {
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
        });
        return { user: toAuthUser(withHandle) };
      } catch {
        clearAuthCookies(reply);
        return reply.code(401).send({ error: "Refresh token inválido" });
      }
    },
  );

  app.get(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
      });
      if (!user) {
        return reply.code(401).send({ error: "Usuário não encontrado" });
      }
      const withHandle = await ensureUserHandle(user);
      return { user: toAuthUser(withHandle) };
    },
  );

  app.post<{ Body: { email?: string } }>(
    "/auth/forgot-password",
    {
      config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const emailRaw = request.body?.email ?? "";
      if (!isValidEmail(emailRaw)) {
        return reply.code(400).send({ error: "E-mail inválido" });
      }
      try {
        const result = await requestPasswordReset(normalizeEmail(emailRaw));
        return result;
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: "Não foi possível enviar o e-mail" });
      }
    },
  );

  app.post<{ Body: { token?: string; password?: string } }>(
    "/auth/reset-password",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      try {
        const token = request.body?.token?.trim() ?? "";
        const password = request.body?.password ?? "";
        if (!token) return reply.code(400).send({ error: "Token obrigatório" });
        await resetPassword(token, password);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Body: { token?: string } }>(
    "/auth/verify-email",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      try {
        const token = request.body?.token?.trim() ?? "";
        if (!token) return reply.code(400).send({ error: "Token obrigatório" });
        await verifyEmailToken(token);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post(
    "/auth/verify-email/resend",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      try {
        return await sendVerificationEmail(request.userId!);
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
    "/auth/change-password",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const currentPassword = request.body?.currentPassword ?? "";
        const newPassword = request.body?.newPassword ?? "";
        if (!currentPassword || !newPassword) {
          return reply.code(400).send({ error: "Informe a senha atual e a nova" });
        }
        await changePassword(request.userId!, currentPassword, newPassword);
        clearAuthCookies(reply);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.get(
    "/auth/sessions",
    { preHandler: [app.authenticate] },
    async (request) => {
      const sessions = await listSessions(
        request.userId!,
        request.cookies[config.cookie.refresh],
      );
      return { sessions };
    },
  );

  app.post(
    "/auth/sessions/revoke-all",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await revokeAllUserSessions(request.userId!);
      clearAuthCookies(reply);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/auth/sessions/:id/revoke",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        await revokeSession(request.userId!, request.params.id);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.delete<{ Body: { password?: string } }>(
    "/auth/account",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const password = request.body?.password ?? "";
        if (!password) {
          return reply.code(400).send({ error: "Confirme com a senha" });
        }
        await deleteAccount(request.userId!, password);
        clearAuthCookies(reply);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
