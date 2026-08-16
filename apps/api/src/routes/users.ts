import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { toAuthUser, toPublicUser } from "../lib/serialize.js";
import {
  blockUser,
  listBlocked,
  unblockUser,
} from "../services/status.js";
import { assertOwnedMedia } from "../services/uploads.js";
import { assertHandle, ensureUserHandle } from "../services/handles.js";

async function blockedIdSet(userId: string) {
  const blocked = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }],
    },
  });
  return new Set(blocked.flatMap((b) => [b.blockerId, b.blockedId]));
}

function nameOrHandleFilter(q: string) {
  const handle = q.replace(/^@/, "").trim();
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { handle: { contains: handle, mode: "insensitive" as const } },
    ],
  };
}

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    "/users",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const q = (request.query.q ?? "").trim();
      const blockedIds = await blockedIdSet(request.userId!);
      const take = Math.min(Number(request.query.limit) || 100, 200);

      const users = await prisma.user.findMany({
        where: {
          id: { not: request.userId! },
          ...(q.length > 0 ? nameOrHandleFilter(q) : {}),
        },
        orderBy: { name: "asc" },
        take,
      });

      return {
        users: users
          .filter((u) => !blockedIds.has(u.id))
          .map((u) => toPublicUser(u, request.userId!)),
      };
    },
  );

  app.get<{ Querystring: { q?: string } }>(
    "/users/search",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const q = (request.query.q ?? "").trim();
      if (q.length < 2) return { users: [] };

      const blockedIds = await blockedIdSet(request.userId!);

      const users = await prisma.user.findMany({
        where: {
          id: { not: request.userId! },
          ...nameOrHandleFilter(q),
        },
        take: 20,
        orderBy: { name: "asc" },
      });

      return {
        users: users
          .filter((u) => !blockedIds.has(u.id))
          .map((u) => toPublicUser(u, request.userId!)),
      };
    },
  );

  app.get<{ Params: { handle: string } }>(
    "/users/handle/:handle",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const handle = request.params.handle.trim().toLowerCase().replace(/^@/, "");
      const user = await prisma.user.findUnique({ where: { handle } });
      if (!user || user.id === request.userId) {
        if (user?.id === request.userId) {
          const withHandle = await ensureUserHandle(user);
          return { user: toPublicUser(withHandle, request.userId) };
        }
        return reply.code(404).send({ error: "Pessoa não encontrada" });
      }
      const blocked = await blockedIdSet(request.userId!);
      if (blocked.has(user.id)) {
        return reply.code(404).send({ error: "Pessoa não encontrada" });
      }
      return { user: toPublicUser(user, request.userId!) };
    },
  );

  app.patch<{
    Body: {
      name?: string;
      handle?: string;
      bio?: string | null;
      avatarUrl?: string | null;
      hideLastSeen?: boolean;
      sendReadReceipts?: boolean;
    };
  }>("/users/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body ?? {};
    if (body.name !== undefined && body.name.trim().length < 2) {
      return reply.code(400).send({ error: "Nome inválido" });
    }
    if (body.bio !== undefined && body.bio && body.bio.length > 280) {
      return reply.code(400).send({ error: "Bio muito longa" });
    }
    if (body.avatarUrl) {
      try {
        await assertOwnedMedia(body.avatarUrl, request.userId!);
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        return reply.code(e.statusCode ?? 400).send({ error: e.message });
      }
    }

    let handle: string | undefined;
    if (body.handle !== undefined) {
      handle = assertHandle(body.handle);
      const taken = await prisma.user.findFirst({
        where: { handle, id: { not: request.userId! } },
      });
      if (taken) {
        return reply.code(409).send({ error: "Este apelido já está em uso" });
      }
    }

    const user = await prisma.user.update({
      where: { id: request.userId! },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(handle !== undefined ? { handle } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        ...(body.hideLastSeen !== undefined
          ? { hideLastSeen: body.hideLastSeen }
          : {}),
        ...(body.sendReadReceipts !== undefined
          ? { sendReadReceipts: body.sendReadReceipts }
          : {}),
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
