export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

export const RESERVED_HANDLES = new Set([
  "app",
  "login",
  "register",
  "join",
  "u",
  "api",
  "admin",
  "settings",
  "status",
  "help",
  "support",
  "remetum",
  "ebano",
  "me",
  "reset",
  "forgot",
  "verify",
]);

export function normalizeHandle(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, HANDLE_MAX);
}

export function suggestHandle(name: string): string {
  const base = normalizeHandle(name);
  if (base.length >= HANDLE_MIN && !RESERVED_HANDLES.has(base)) return base;
  if (base.length > 0 && base.length < HANDLE_MIN) {
    return `${base}${"x".repeat(HANDLE_MIN - base.length)}`;
  }
  return "user";
}

export function isValidHandle(raw: string): boolean {
  const handle = raw.trim().toLowerCase();
  return HANDLE_RE.test(handle) && !RESERVED_HANDLES.has(handle);
}
