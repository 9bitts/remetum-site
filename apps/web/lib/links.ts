const URL_RE =
  /\b(?:https?:\/\/[^\s<]+|www\.[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:\/[^\s<]*)?)/gi;

const FILE_EXT =
  /^(?:png|jpe?g|gif|webp|mp3|mp4|pdf|txt|docx?|xlsx?|zip|rar|exe|svg|mov|avi|mkv|csv)$/i;

export function hrefForLink(raw: string) {
  const value = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

function looksLikeUrl(value: string) {
  if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) return true;
  const host = (value.split("/")[0] ?? "").split(":")[0] ?? "";
  const tld = host.split(".").pop() ?? "";
  if (FILE_EXT.test(tld)) return false;
  return host.includes(".");
}

export function splitMessageLinks(text: string) {
  const parts: { type: "text" | "url"; value: string }[] = [];
  const re = new RegExp(URL_RE.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) });
    }
    const raw = match[0] ?? "";
    const trimmed = raw.replace(/[),.!?;:]+$/g, "");
    if (looksLikeUrl(trimmed)) {
      parts.push({ type: "url", value: trimmed });
    } else {
      parts.push({ type: "text", value: trimmed });
    }
    if (trimmed.length < raw.length) {
      parts.push({ type: "text", value: raw.slice(trimmed.length) });
    }
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text" as const, value: text }];
}

export function groupInviteUrl(code: string) {
  if (typeof window === "undefined") return `/join/${code}`;
  return `${window.location.origin}/join/${code}`;
}

export function profileUrl(handle: string) {
  const slug = handle.replace(/^@/, "");
  if (typeof window === "undefined") return `/u/${slug}`;
  return `${window.location.origin}/u/${slug}`;
}

export function safeNextPath(raw: string | null | undefined) {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("://")) return null;
  if (
    raw.startsWith("/join/") ||
    raw.startsWith("/u/") ||
    raw.startsWith("/app") ||
    raw.startsWith("/verify-email")
  ) {
    return raw;
  }
  return null;
}
