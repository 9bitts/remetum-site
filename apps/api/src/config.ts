function parseCorsOrigins(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const defaultOrigins = [
  "http://localhost:3000",
  "https://remetum.com",
  "https://www.remetum.com",
];

const publicApiUrl = process.env.PUBLIC_API_URL ?? "http://localhost:4000";
const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_JWT = "dev-jwt-secret-change-me";
const DEFAULT_REFRESH = "dev-refresh-secret-change-me";

function requireSecret(name: string, value: string | undefined, fallback: string) {
  const secret = (value ?? "").trim() || fallback;
  if (isProduction && (!value?.trim() || secret === fallback)) {
    // Do not crash the process — a down API looks like an infinite "Carregando…".
    // Still log loudly so secrets get rotated in Railway.
    console.error(
      `[security] ${name} is missing or still the insecure default. Set a long random value in Railway env.`,
    );
  } else if (isProduction && secret.length < 24) {
    console.error(
      `[security] ${name} is shorter than recommended (24+ chars).`,
    );
  }
  return secret;
}

function resolveCookieDomain(): string | undefined {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN === "none"
      ? undefined
      : process.env.COOKIE_DOMAIN;
  }
  try {
    const host = new URL(publicApiUrl).hostname;
    if (host === "localhost" || host.endsWith(".localhost")) return undefined;
    const parts = host.split(".");
    if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
  } catch {
    // ignore
  }
  return undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProduction,
  corsOrigins: parseCorsOrigins(
    process.env.CORS_ORIGIN ?? defaultOrigins.join(","),
  ),
  publicApiUrl,
  jwtSecret: requireSecret("JWT_SECRET", process.env.JWT_SECRET, DEFAULT_JWT),
  jwtRefreshSecret: requireSecret(
    "JWT_REFRESH_SECRET",
    process.env.JWT_REFRESH_SECRET,
    DEFAULT_REFRESH,
  ),
  accessTokenTtlSeconds: 60 * 15,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  cookie: {
    access: "ebano_access",
    refresh: "ebano_refresh",
    domain: resolveCookieDomain(),
    secure:
      process.env.COOKIE_SECURE === "true" ||
      isProduction ||
      publicApiUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
  },
  upload: {
    maxBytes: 25 * 1024 * 1024,
    allowedMime: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
      "image/avif",
      "image/bmp",
      "audio/webm",
      "audio/ogg",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/aac",
      "audio/x-m4a",
      "audio/x-wav",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/3gpp",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/rtf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
    ],
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKey: process.env.R2_ACCESS_KEY ?? "",
    secretKey: process.env.R2_SECRET_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:hello@remetum.com",
  },
  livekit: {
    url: (process.env.LIVEKIT_URL ?? "").trim(),
    apiKey: (process.env.LIVEKIT_API_KEY ?? "").trim(),
    apiSecret: (process.env.LIVEKIT_API_SECRET ?? "").trim(),
  },
  webPublicUrl: (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  ),
  redisUrl: (process.env.REDIS_URL ?? "").trim(),
  mail: {
    from: process.env.MAIL_FROM ?? "Remetum <hello@remetum.com>",
    resendApiKey: (process.env.RESEND_API_KEY ?? "").trim(),
    smtpUrl: (process.env.SMTP_URL ?? "").trim(),
  },
};

export function r2Enabled() {
  return Boolean(
    config.r2.accountId &&
      config.r2.accessKey &&
      config.r2.secretKey &&
      config.r2.bucket,
  );
}

export function pushEnabled() {
  return Boolean(config.vapid.publicKey && config.vapid.privateKey);
}

export function livekitConfigured() {
  return Boolean(
    config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret,
  );
}
