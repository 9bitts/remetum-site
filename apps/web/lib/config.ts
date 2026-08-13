/** API base URL (REST + used by uploads). */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

/** Socket.IO connects to the same API origin. */
export const SOCKET_URL = API_URL;
