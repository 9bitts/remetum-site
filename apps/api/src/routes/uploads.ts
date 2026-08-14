import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { storeUpload } from "../services/uploads.js";
import { config } from "../config.js";

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: config.upload.maxBytes,
      files: 1,
      fields: 10,
    },
    throwFileSizeLimit: true,
  });

  app.post(
    "/uploads",
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ error: "Arquivo obrigatório" });
        }

        const buffer = await file.toBuffer();
        if (file.file.truncated) {
          return reply
            .code(413)
            .send({ error: "Arquivo muito grande (máx. 25MB)" });
        }

        const stored = await storeUpload({
          buffer,
          mimeType: file.mimetype,
          filename: file.filename || "arquivo",
          uploaderId: request.userId!,
        });
        return {
          url: stored.url,
          mimeType: stored.mimeType,
          type: stored.type,
        };
      } catch (err) {
        request.log.error(err);
        const e = err as { statusCode?: number; code?: string; message: string };
        const tooLarge =
          e.statusCode === 413 ||
          e.code === "FST_REQ_FILE_TOO_LARGE" ||
          e.code === "FST_ERR_CTP_BODY_TOO_LARGE" ||
          /file size|too large/i.test(e.message || "");
        return reply
          .code(tooLarge ? 413 : (e.statusCode ?? 500))
          .send({
            error: tooLarge
              ? "Arquivo muito grande (máx. 25MB)"
              : e.statusCode && e.statusCode < 500
                ? e.message
                : "Falha no upload",
          });
      }
    },
  );
}
