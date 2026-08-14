import { API_URL } from "./config";
import { fetchWithAuth } from "./api";

/** Resolve stored media URLs so avatars/files load with API auth cookies. */
export function mediaSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const absolute = url.startsWith("/") ? `${API_URL}${url}` : url;
    const parsed = new URL(absolute);
    if (parsed.pathname.startsWith("/media/")) {
      // Hit the API host directly so httpOnly auth cookies are sent.
      return `${API_URL}${parsed.pathname}${parsed.search}`;
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return `${API_URL}${parsed.pathname}${parsed.search}`;
    }
    return absolute;
  } catch {
    return url;
  }
}

export function fileLooksLikePdf(url: string, name?: string | null) {
  const hay = `${name ?? ""} ${url}`.toLowerCase();
  return /\.pdf(\?|#|$)/.test(hay) || hay.includes("application/pdf");
}

/** Opens a file in a new tab, or downloads it when the browser cannot preview it. */
export async function openMediaFile(url: string, filename?: string | null) {
  const src = mediaSrc(url) ?? url;
  try {
    const res = await fetchWithAuth(src);
    if (!res.ok) throw new Error("Falha ao abrir arquivo");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    if (filename && !fileLooksLikePdf(url, filename)) {
      a.setAttribute("download", filename);
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    const a = document.createElement("a");
    a.href = src;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
