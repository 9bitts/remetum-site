import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { storeUpload } from "../services/uploads.js";
import { config } from "../config.js";

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: config.upload.maxBytes },
  });

  app.post(
    "/uploads",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "Arquivo obrigatório" });
      }

      const buffer = await file.toBuffer();
      try {
        const stored = await storeUpload({
          buffer,
          mimeType: file.mimetype,
          filename: file.filename,
        });
        return {
          url: stored.url,
          mimeType: stored.mimeType,
          type: stored.mimeType.startsWith("image/")
            ? "image"
            : stored.mimeType.startsWith("audio/")
              ? "audio"
              : stored.mimeType.startsWith("video/")
                ? "video"
                : "file",
        };
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        return reply
          .code(e.statusCode ?? 500)
          .send({ error: e.message || "Falha no upload" });
      }
    },
  );
}
