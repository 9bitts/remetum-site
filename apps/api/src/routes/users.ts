import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { toAuthUser, toPublicUser } from "../lib/serialize.js";
import {
  blockUser,
  listBlocked,
  unblockUser,
} from "../services/status.js";

async function blockedIdSet(userId: string) {
  const blocked = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }],
    },
  });
  return new Set(blocked.flatMap((b) => [b.blockerId, b.blockedId]));
}

export async function userRoutes(app: FastifyInstance) {
  app.get("/users", { preHandler: [app.authenticate] }, async (request) => {
    const blockedIds = await blockedIdSet(request.userId!);
    const users = await prisma.user.findMany({
      where: { id: { not: request.userId! } },
      orderBy: { name: "asc" },
      take: 1000,
    });

    return {
      users: users.filter((u) => !blockedIds.has(u.id)).map(toPublicUser),
    };
  });

  app.get<{ Querystring: { q?: string } }>(
    "/users/search",
    { preHandler: [app.authenticate] },
    async (request) => {
      const q = (request.query.q ?? "").trim();
      if (q.length < 2) return { users: [] };

      const blockedIds = await blockedIdSet(request.userId!);

      const users = await prisma.user.findMany({
        where: {
          id: { not: request.userId! },
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 20,
        orderBy: { name: "asc" },
      });

      return {
        users: users
          .filter((u) => !blockedIds.has(u.id))
          .map(toPublicUser),
      };
    },
  );

  app.patch<{
    Body: { name?: string; bio?: string | null; avatarUrl?: string | null };
  }>("/users/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body ?? {};
    if (body.name !== undefined && body.name.trim().length < 2) {
      return reply.code(400).send({ error: "Nome inválido" });
    }

    const user = await prisma.user.update({
      where: { id: request.userId! },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
    });

    return { user: toAuthUser(user) };
  });

  app.get("/users/blocked", { preHandler: [app.authenticate] }, async (request) => {
    const users = await listBlocked(request.userId!);
    return { users };
  });

  app.post<{ Body: { userId?: string } }>(
    "/users/block",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        if (!request.body?.userId) {
          return reply.code(400).send({ error: "userId obrigatório" });
        }
        await blockUser(request.userId!, request.body.userId);
        return { ok: true };
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        return reply.code(e.statusCode ?? 500).send({ error: e.message });
      }
    },
  );

  app.post<{ Body: { userId?: string } }>(
    "/users/unblock",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!request.body?.userId) {
        return reply.code(400).send({ error: "userId obrigatório" });
      }
      await unblockUser(request.userId!, request.body.userId);
      return { ok: true };
    },
  );
}
