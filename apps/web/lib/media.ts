import { API_URL } from "./config";

/** Resolve stored media URLs so avatars/files load in the browser. */
export function mediaSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const absolute = url.startsWith("/") ? `${API_URL}${url}` : url;
    const parsed = new URL(absolute);
    if (parsed.pathname.startsWith("/media/")) {
      return `${parsed.pathname}${parsed.search}`;
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
export function openMediaFile(url: string, filename?: string | null) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  if (filename && !fileLooksLikePdf(url, filename)) {
    a.setAttribute("download", filename);
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}
