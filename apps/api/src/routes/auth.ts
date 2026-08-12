import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../services/tokens.js";
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validatePassword(password: string) {
  return password.length >= 8;
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

        if (name.length < 2) {
          return reply
            .code(400)
            .send({ error: "Nome deve ter ao menos 2 caracteres" });
        }
        if (!emailRaw.includes("@")) {
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
          return reply.code(409).send({ error: "E-mail já cadastrado" });
        }

        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
          data: {
            name,
            email,
            passwordHash,
          },
        });

        const [accessToken, refreshToken] = await Promise.all([
          signAccessToken(user.id, user.email),
          signRefreshToken(user.id),
        ]);
        setAuthCookies(reply, { accessToken, refreshToken });

        return reply.code(201).send({ user: toAuthUser(user) });
      } catch (err) {
        request.log.error(err);
        const message =
          err instanceof Error ? err.message : "Erro interno no registro";
        return reply.code(500).send({ error: message });
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

        const [accessToken, refreshToken] = await Promise.all([
          signAccessToken(user.id, user.email),
          signRefreshToken(user.id),
        ]);
        setAuthCookies(reply, { accessToken, refreshToken });

        return { user: toAuthUser(user) };
      } catch (err) {
        request.log.error(err);
        const message =
          err instanceof Error ? err.message : "Erro interno no login";
        return reply.code(500).send({ error: message });
      }
    },
  );

  app.post("/auth/logout", async (_request, reply) => {
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies[config.cookie.refresh];
    if (!token) {
      return reply.code(401).send({ error: "Refresh token ausente" });
    }

    try {
      const payload = await verifyRefreshToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        clearAuthCookies(reply);
        return reply.code(401).send({ error: "Usuário não encontrado" });
      }

      const [accessToken, refreshToken] = await Promise.all([
        signAccessToken(user.id, user.email),
        signRefreshToken(user.id),
      ]);
      setAuthCookies(reply, { accessToken, refreshToken });

      return { user: toAuthUser(user) };
    } catch {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: "Refresh token inválido" });
    }
  });

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
