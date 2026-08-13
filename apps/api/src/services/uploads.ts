import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FastifyReply } from "fastify";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../prisma.js";
import { config, r2Enabled } from "../config.js";

const uploadsDir = path.resolve(process.cwd(), "uploads");

function getS3() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKey,
      secretAccessKey: config.r2.secretKey,
    },
  });
}

export async function storeUpload(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}) {
  if (!config.upload.allowedMime.includes(input.mimeType)) {
    throw Object.assign(new Error("Tipo de arquivo não permitido"), {
      statusCode: 400,
    });
  }
  if (input.buffer.byteLength > config.upload.maxBytes) {
    throw Object.assign(new Error("Arquivo muito grande (máx. 25MB)"), {
      statusCode: 400,
    });
  }

  const ext = path.extname(input.filename) || mimeToExt(input.mimeType);
  const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

  if (r2Enabled()) {
    await getS3().send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );
    const base =
      config.r2.publicBaseUrl ||
      `https://${config.r2.bucket}.${config.r2.accountId}.r2.cloudflarestorage.com`;
    return {
      url: `${base.replace(/\/$/, "")}/${key}`,
      key,
      mimeType: input.mimeType,
    };
  }

  const stored = await prisma.storedFile.create({
    data: {
      mimeType: input.mimeType,
      data: new Uint8Array(input.buffer),
    },
  });
  return {
    url: `${config.publicApiUrl}/media/${stored.id}`,
    key: stored.id,
    mimeType: input.mimeType,
  };
}

function applyMediaHeaders(reply: FastifyReply, mimeType: string) {
  reply
    .type(mimeType)
    .header("Cache-Control", "public, max-age=31536000, immutable")
    .header("Cross-Origin-Resource-Policy", "cross-origin");
}

export async function sendMedia(id: string, reply: FastifyReply) {
  if (!id || id.includes("..")) {
    return reply.code(400).send({ error: "Arquivo inválido" });
  }

  const stored = await prisma.storedFile.findUnique({ where: { id } });
  if (stored) {
    applyMediaHeaders(reply, stored.mimeType);
    return reply.send(Buffer.from(stored.data));
  }

  const diskPath = path.join(uploadsDir, id);
  try {
    await access(diskPath);
    applyMediaHeaders(reply, mimeFromExt(path.extname(diskPath)));
    return reply.send(createReadStream(diskPath));
  } catch {
    return reply.code(404).send({ error: "Arquivo não encontrado" });
  }
}

function mimeToExt(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "audio/webm":
      return ".webm";
    case "audio/ogg":
      return ".ogg";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
      return ".m4a";
    case "audio/wav":
      return ".wav";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "application/pdf":
      return ".pdf";
    case "application/zip":
      return ".zip";
    default:
      return "";
  }
}

function mimeFromExt(ext: string) {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".webm":
      return "video/webm";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export function getUploadsDir() {
  return uploadsDir;
}
