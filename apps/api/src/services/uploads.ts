import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FastifyReply } from "fastify";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../prisma.js";
import { config, r2Enabled } from "../config.js";

const uploadsDir = path.resolve(process.cwd(), "uploads");

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/x-wav": "audio/wav",
  "application/x-zip-compressed": "application/zip",
  "application/x-zip": "application/zip",
};

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".3gp": "video/3gpp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".rtf": "application/rtf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".zip": "application/zip",
};

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

function isGenericMime(mime: string) {
  return (
    !mime ||
    mime === "application/octet-stream" ||
    mime === "binary/octet-stream"
  );
}

export function resolveUploadMime(mimeType: string, filename: string) {
  const raw = (mimeType || "").split(";")[0].trim().toLowerCase();
  const aliased = MIME_ALIASES[raw] ?? raw;
  const fromExt = EXT_MIME[path.extname(filename).toLowerCase()];

  if (!isGenericMime(aliased) && config.upload.allowedMime.includes(aliased)) {
    return aliased;
  }
  if (fromExt) return fromExt;
  return aliased;
}

function mediaKind(
  mimeType: string,
): "image" | "file" | "audio" | "video" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export async function storeUpload(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}) {
  const mimeType = resolveUploadMime(input.mimeType, input.filename);
  if (!config.upload.allowedMime.includes(mimeType)) {
    throw Object.assign(new Error("Tipo de arquivo não permitido"), {
      statusCode: 400,
    });
  }
  if (input.buffer.byteLength > config.upload.maxBytes) {
    throw Object.assign(new Error("Arquivo muito grande (máx. 25MB)"), {
      statusCode: 400,
    });
  }

  const ext = path.extname(input.filename) || mimeToExt(mimeType);
  const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

  if (r2Enabled()) {
    try {
      await getS3().send(
        new PutObjectCommand({
          Bucket: config.r2.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: mimeType,
        }),
      );
      const base =
        config.r2.publicBaseUrl ||
        `https://${config.r2.bucket}.${config.r2.accountId}.r2.cloudflarestorage.com`;
      return {
        url: `${base.replace(/\/$/, "")}/${key}`,
        key,
        mimeType,
        type: mediaKind(mimeType),
      };
    } catch (err) {
      console.error("R2 upload failed, falling back to database", err);
    }
  }

  try {
    const stored = await prisma.storedFile.create({
      data: {
        mimeType,
        data: new Uint8Array(input.buffer),
      },
    });
    return {
      url: `${config.publicApiUrl}/media/${stored.id}`,
      key: stored.id,
      mimeType,
      type: mediaKind(mimeType),
    };
  } catch (err) {
    console.error("Failed to persist upload", err);
    throw Object.assign(
      new Error("Não foi possível salvar o arquivo. Tente um arquivo menor."),
      { statusCode: 500 },
    );
  }
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
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/avif":
      return ".avif";
    case "image/bmp":
      return ".bmp";
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
    case "audio/aac":
      return ".aac";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "application/pdf":
      return ".pdf";
    case "application/zip":
      return ".zip";
    case "text/plain":
      return ".txt";
    case "text/csv":
      return ".csv";
    case "application/rtf":
      return ".rtf";
    case "application/msword":
      return ".doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "application/vnd.ms-excel":
      return ".xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return ".xlsx";
    case "application/vnd.ms-powerpoint":
      return ".ppt";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return ".pptx";
    default:
      return "";
  }
}

function mimeFromExt(ext: string) {
  return EXT_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export function getUploadsDir() {
  return uploadsDir;
}
