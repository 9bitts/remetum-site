const URL_RE = /(https?:\/\/[^\s<]+)/gi;

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
    parts.push({ type: "url", value: trimmed });
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
