import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
    throw Object.assign(new Error("Arquivo muito grande (máx. 10MB)"), {
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

  await mkdir(path.join(uploadsDir, path.dirname(key)), { recursive: true });
  await writeFile(path.join(uploadsDir, key), input.buffer);
  return {
    url: `${config.publicApiUrl}/media/${key}`,
    key,
    mimeType: input.mimeType,
  };
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
    case "application/pdf":
      return ".pdf";
    case "application/zip":
      return ".zip";
    default:
      return "";
  }
}

export function getUploadsDir() {
  return uploadsDir;
}
