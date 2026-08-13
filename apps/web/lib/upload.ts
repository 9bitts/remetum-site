import { API_URL } from "./config";
import { fileToJpegBlob } from "./image";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "25 MB";

export type UploadedMedia = {
  url: string;
  type: "image" | "file" | "audio" | "video";
};

export function formatFileSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function uploadTooLargeMessage(sizeBytes = MAX_UPLOAD_BYTES) {
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return `Este arquivo tem ${formatFileSize(sizeBytes)}. O limite de envio é ${MAX_UPLOAD_LABEL}.`;
  }
  return `Arquivo muito grande. O limite de envio é ${MAX_UPLOAD_LABEL}.`;
}

function isAnimatedImage(file: File) {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

async function prepareFile(
  file: File,
  imageMaxSize: number,
): Promise<{ blob: Blob; filename: string }> {
  const filename = file.name || "arquivo";
  const looksLikeImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(filename);
  if (looksLikeImage && !isAnimatedImage(file)) {
    try {
      const blob = await fileToJpegBlob(file, imageMaxSize, 0.85);
      return {
        blob,
        filename: filename.replace(/\.[^.]+$/, "") + ".jpg",
      };
    } catch {
      return { blob: file, filename };
    }
  }
  return { blob: file, filename };
}

export async function uploadMedia(
  file: File,
  opts?: { imageMaxSize?: number },
): Promise<UploadedMedia> {
  const prepared = await prepareFile(file, opts?.imageMaxSize ?? 1920);
  if (prepared.blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(uploadTooLargeMessage(file.size || prepared.blob.size));
  }

  const form = new FormData();
  form.append("file", prepared.blob, prepared.filename);

  const res = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    type?: UploadedMedia["type"];
  };
  if (!res.ok || !data.url) {
    if (res.status === 413) {
      throw new Error(uploadTooLargeMessage(file.size));
    }
    throw new Error(data.error ?? `Falha no upload (${res.status})`);
  }
  return {
    url: data.url,
    type: data.type ?? "file",
  };
}
