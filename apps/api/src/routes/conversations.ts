import type { FastifyInstance } from "fastify";
import {
  createGroupConversation,
  getConversationSummary,
  getOrCreateDirectConversation,
  listConversationsForUser,
  listMessages,
  searchMessages,
} from "../services/conversations.js";

type ErrLike = { statusCode?: number; message: string };

function sendError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const e = err as ErrLike;
  return reply.code(e.statusCode ?? 500).send({ error: e.message || "Erro interno" });
}

export async function conversationRoutes(app: FastifyInstance) {
  app.get(
    "/conversations",
    { preHandler: [app.authenticate] },
    async (request) => {
      const conversations = await listConversationsForUser(request.userId!);
      return { conversations };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/conversations/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const conversation = await getConversationSummary(
          request.params.id,
          request.userId!,
        );
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return await listMessages(
          request.params.id,
          request.userId!,
          request.query.cursor,
        );
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Body: { userId?: string } }>(
    "/conversations/direct",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const otherId = request.body?.userId;
        if (!otherId) {
          return reply.code(400).send({ error: "userId é obrigatório" });
        }
        const created = await getOrCreateDirectConversation(
          request.userId!,
          otherId,
        );
        const conversation = await getConversationSummary(
          created.id,
          request.userId!,
        );
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Body: { name?: string; memberIds?: string[] } }>(
    "/conversations/group",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const name = request.body?.name ?? "";
        const memberIds = request.body?.memberIds ?? [];
        const created = await createGroupConversation(
          request.userId!,
          name,
          memberIds,
        );
        const conversation = await getConversationSummary(
          created.id,
          request.userId!,
        );
        return reply.code(201).send({ conversation });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.get<{ Querystring: { q?: string } }>(
    "/search/messages",
    { preHandler: [app.authenticate] },
    async (request) => {
      const messages = await searchMessages(
        request.userId!,
        request.query.q ?? "",
      );
      return { messages };
    },
  );
}
