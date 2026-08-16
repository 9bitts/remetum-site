import { API_URL } from "./config";
import { connectSocket } from "./socket";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  retryOn401?: boolean;
  signal?: AbortSignal;
};

const AUTH_SKIP_REFRESH = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
]);

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshSession(signal?: AbortSignal): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
      if (res.ok) connectSocket();
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function fetchWithAuth(
  input: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: "include" });
  if (res.status !== 401 || !retryOn401) return res;
  if (init.signal?.aborted) return res;
  const ok = await refreshSession(init.signal ?? undefined);
  if (!ok) return res;
  return fetch(input, { ...init, credentials: "include" });
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method =
    options.method ?? (options.body !== undefined ? "POST" : "GET");
  const retryOn401 =
    options.retryOn401 !== false && !AUTH_SKIP_REFRESH.has(path);

  const res = await fetchWithAuth(
    `${API_URL}${path}`,
    {
      method,
      signal: options.signal,
      headers:
        options.body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    },
    retryOn401,
  );

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Falha na requisição");
  }

  return data;
}
