export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret-change-me",
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  accessTokenTtlSeconds: 60 * 15,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  cookie: {
    access: "ebano_access",
    refresh: "ebano_refresh",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  },
  upload: {
    maxBytes: 10 * 1024 * 1024,
    allowedMime: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "application/zip",
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
    subject: process.env.VAPID_SUBJECT ?? "mailto:hello@ebano.app",
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
