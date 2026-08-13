import type { FastifyReply } from "fastify";
import { config } from "../config.js";

function cookieBase() {
  const { cookie } = config;
  return {
    path: cookie.path,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
) {
  const { cookie } = config;
  const base = cookieBase();

  reply.setCookie(cookie.access, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: config.accessTokenTtlSeconds,
  });

  reply.setCookie(cookie.refresh, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: config.refreshTokenTtlSeconds,
  });
}

export function clearAuthCookies(reply: FastifyReply) {
  const { cookie } = config;
  const base = cookieBase();
  reply.clearCookie(cookie.access, base);
  reply.clearCookie(cookie.refresh, base);
}
