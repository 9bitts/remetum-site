import { API_URL } from "./config";

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
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method =
    options.method ?? (options.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers:
      options.body !== undefined
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Falha na requisição");
  }

  return data;
}
