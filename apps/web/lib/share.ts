import { fetchWithAuth } from "./api";
import { mediaSrc } from "./media";

const SHARE_FETCH_MS = 60_000;

export function isShareableMedia(
  type: string,
): type is "image" | "video" | "file" | "audio" {
  return (
    type === "image" || type === "video" || type === "file" || type === "audio"
  );
}

function guessFilename(url: string, mime: string, fallback?: string | null) {
  if (fallback && /\.[a-z0-9]{2,8}$/i.test(fallback)) return fallback;
  try {
    const fromUrl = new URL(url, "https://remetum.com").pathname.split("/").pop();
    if (fromUrl && /\.[a-z0-9]{2,8}$/i.test(fromUrl) && fromUrl !== "media") {
      return decodeURIComponent(fromUrl);
    }
  } catch {
    // ignore
  }
  const subtype = mime.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg");
  const ext = subtype && /^[a-z0-9.+-]+$/i.test(subtype) ? subtype : "bin";
  return fallback?.trim() || `remetum.${ext}`;
}

async function loadMediaFile(url: string, filename?: string | null): Promise<File> {
  const src = mediaSrc(url) ?? url;
  const res = await fetchWithAuth(src, {}, true, SHARE_FETCH_MS);
  if (!res.ok) throw new Error("Falha ao carregar arquivo");
  const blob = await res.blob();
  const name = guessFilename(src, blob.type, filename);
  return new File([blob], name, {
    type: blob.type || "application/octet-stream",
  });
}

function saveFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function shareMediaFile(
  url: string,
  filename?: string | null,
): Promise<"shared" | "downloaded" | "aborted"> {
  const file = await loadMediaFile(url, filename);
  const payload: ShareData = { files: [file], title: file.name };

  try {
    if (typeof navigator.canShare === "function" && navigator.canShare(payload)) {
      await navigator.share(payload);
      return "shared";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "aborted";
  }

  saveFile(file);
  return "downloaded";
}
