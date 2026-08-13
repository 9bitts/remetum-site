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
