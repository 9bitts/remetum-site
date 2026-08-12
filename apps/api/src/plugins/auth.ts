import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config.js";
import { verifyAccessToken } from "../services/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("userId", null);

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.cookies[config.cookie.access];
      if (!token) {
        return reply.code(401).send({ error: "Não autenticado" });
      }

      try {
        const payload = await verifyAccessToken(token);
        request.userId = payload.sub;
      } catch {
        return reply.code(401).send({ error: "Sessão inválida ou expirada" });
      }
    },
  );
}

export default fp(authPlugin, { name: "auth-plugin" });
