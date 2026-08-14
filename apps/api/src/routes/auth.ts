import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import {
  issueAuthTokens,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/sessions.js";
import { setAuthCookies, clearAuthCookies } from "../lib/cookies.js";
import { toAuthUser } from "../lib/serialize.js";
import { config } from "../config.js";

type RegisterBody = {
  name?: string;
  email?: string;
  password?: string;
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
          // Same shape as success-ish path for enumeration resistance
          return reply
            .code(409)
            .send({ error: "Não foi possível criar a conta com estes dados" });
        }

        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
          data: {
            name,
            email,
            passwordHash,
          },
        });

        const tokens = await issueAuthTokens(user.id, user.email);
        setAuthCookies(reply, tokens);

        return reply.code(201).send({ user: toAuthUser(user) });
      } catch (err) {
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

        const tokens = await issueAuthTokens(user.id, user.email);
        setAuthCookies(reply, tokens);

        return { user: toAuthUser(user) };
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
        setAuthCookies(reply, {
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
        });
        return { user: toAuthUser(rotated.user) };
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
      return { user: toAuthUser(user) };
    },
  );
}
