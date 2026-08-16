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
