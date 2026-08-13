/** Absolute API origin (Socket.IO + media). */
export const SOCKET_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

/**
 * REST calls go through same-origin `/backend` proxy (Next rewrite)
 * to avoid cross-origin CORS issues in production.
 */
export const API_URL = "/backend";
