import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FastifyReply } from "fastify";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../prisma.js";
import { config, r2Enabled } from "../config.js";

const uploadsDir = path.resolve(process.cwd(), "uploads");

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/x-wav": "audio/wav",
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

/** Best-effort magic-byte sniff for common media. */
export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }
  // ftyp box → mp4/mov/heic
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.slice(8, 12).toString("ascii");
    if (/heic|heif|mif1/i.test(brand)) return "image/heic";
    if (/qt/i.test(brand)) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

export function resolveUploadMime(
  mimeType: string,
  filename: string,
  buffer?: Buffer,
) {
  const sniffed = buffer ? sniffMime(buffer) : null;
  if (sniffed && config.upload.allowedMime.includes(sniffed)) {
    return sniffed;
  }

  const raw = (mimeType || "").split(";")[0].trim().toLowerCase();
  const aliased = MIME_ALIASES[raw] ?? raw;
  const fromExt = EXT_MIME[path.extname(filename).toLowerCase()];

  if (!isGenericMime(aliased) && config.upload.allowedMime.includes(aliased)) {
    return aliased;
  }
  if (fromExt && config.upload.allowedMime.includes(fromExt)) return fromExt;
  return aliased;
}

function mediaKind(mimeType: string): "image" | "file" | "audio" | "video" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export function mediaUrlForId(id: string) {
  return `${config.publicApiUrl.replace(/\/$/, "")}/media/${id}`;
}

export function extractMediaId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, config.publicApiUrl);
    const match = parsed.pathname.match(/\/media\/([^/]+)$/);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(/\/media\/([^/?#]+)/);
    return match?.[1] ?? null;
  }
}

export function assertAllowedMediaUrl(
  url: string | undefined,
  uploaderId: string,
): void {
  if (!url) return;
  const id = extractMediaId(url);
  if (!id) {
    throw Object.assign(new Error("URL de mídia inválida"), { statusCode: 400 });
  }
  // Ownership checked async by caller via assertOwnedMedia
  void uploaderId;
}

export async function assertOwnedMedia(mediaUrl: string, userId: string) {
  const id = extractMediaId(mediaUrl);
  if (!id) {
    throw Object.assign(new Error("URL de mídia inválida"), { statusCode: 400 });
  }
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) {
    throw Object.assign(new Error("Arquivo não encontrado"), { statusCode: 404 });
  }
  if (file.uploaderId && file.uploaderId !== userId) {
    throw Object.assign(new Error("Arquivo não pertence a você"), {
      statusCode: 403,
    });
  }
  return file;
}

/** Own upload or media already visible to the user (e.g. forward). */
export async function assertUsableMedia(mediaUrl: string, userId: string) {
  const id = extractMediaId(mediaUrl);
  if (!id) {
    throw Object.assign(new Error("URL de mídia inválida"), { statusCode: 400 });
  }
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) {
    throw Object.assign(new Error("Arquivo não encontrado"), { statusCode: 404 });
  }
  if (file.uploaderId === userId) return file;
  if (await canAccessMedia(id, userId)) return file;
  throw Object.assign(new Error("Arquivo não disponível"), { statusCode: 403 });
}

export async function canAccessMedia(fileId: string, userId: string) {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file) return false;
  if (file.uploaderId === userId) return true;

  const needle = `/media/${fileId}`;

  const [asMessage, asAvatar, asGroupAvatar, asStatus] = await Promise.all([
    prisma.message.findFirst({
      where: {
        mediaUrl: { contains: needle },
        conversation: { participants: { some: { userId } } },
      },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        OR: [
          { id: userId, avatarUrl: { contains: needle } },
          {
            avatarUrl: { contains: needle },
            participants: {
              some: {
                conversation: { participants: { some: { userId } } },
              },
            },
          },
        ],
      },
      select: { id: true },
    }),
    prisma.conversation.findFirst({
      where: {
        avatarUrl: { contains: needle },
        participants: { some: { userId } },
      },
      select: { id: true },
    }),
    prisma.statusPost.findFirst({
      where: {
        mediaUrl: { contains: needle },
        expiresAt: { gt: new Date() },
        OR: [
          { userId },
          {
            user: {
              participants: {
                some: {
                  conversation: { participants: { some: { userId } } },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    }),
  ]);

  return Boolean(asMessage || asAvatar || asGroupAvatar || asStatus);
}

export async function storeUpload(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  uploaderId: string;
}) {
  const mimeType = resolveUploadMime(input.mimeType, input.filename, input.buffer);
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
      const stored = await prisma.storedFile.create({
        data: {
          mimeType,
          r2Key: key,
          uploaderId: input.uploaderId,
        },
      });
      return {
        url: mediaUrlForId(stored.id),
        key: stored.id,
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
        uploaderId: input.uploaderId,
      },
    });
    return {
      url: mediaUrlForId(stored.id),
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
  const inline =
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/");
  reply
    .type(mimeType)
    .header("Cache-Control", "private, max-age=3600")
    .header("X-Content-Type-Options", "nosniff")
    .header("Cross-Origin-Resource-Policy", "same-site")
    .header("Content-Disposition", inline ? "inline" : "attachment");
}

function safeDiskPath(id: string): string | null {
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    return null;
  }
  const resolved = path.resolve(uploadsDir, id);
  const relative = path.relative(uploadsDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

export async function sendMedia(
  id: string,
  reply: FastifyReply,
  userId: string,
) {
  if (!id || id.includes("..")) {
    return reply.code(400).send({ error: "Arquivo inválido" });
  }

  const allowed = await canAccessMedia(id, userId);
  if (!allowed) {
    return reply.code(404).send({ error: "Arquivo não encontrado" });
  }

  const stored = await prisma.storedFile.findUnique({ where: { id } });
  if (!stored) {
    return reply.code(404).send({ error: "Arquivo não encontrado" });
  }

  applyMediaHeaders(reply, stored.mimeType);

  if (stored.data && stored.data.length > 0) {
    return reply.send(Buffer.from(stored.data));
  }

  if (stored.r2Key && r2Enabled()) {
    try {
      const obj = await getS3().send(
        new GetObjectCommand({
          Bucket: config.r2.bucket,
          Key: stored.r2Key,
        }),
      );
      const bytes = await obj.Body?.transformToByteArray();
      if (!bytes) {
        return reply.code(404).send({ error: "Arquivo não encontrado" });
      }
      return reply.send(Buffer.from(bytes));
    } catch {
      return reply.code(404).send({ error: "Arquivo não encontrado" });
    }
  }

  const diskPath = safeDiskPath(id);
  if (!diskPath) {
    return reply.code(400).send({ error: "Arquivo inválido" });
  }
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
