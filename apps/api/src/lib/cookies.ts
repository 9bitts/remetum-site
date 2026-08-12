import type { FastifyReply } from "fastify";
import { config } from "../config.js";

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
) {
  const { cookie } = config;

  reply.setCookie(cookie.access, tokens.accessToken, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: config.accessTokenTtlSeconds,
  });

  reply.setCookie(cookie.refresh, tokens.refreshToken, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: config.refreshTokenTtlSeconds,
  });
}

export function clearAuthCookies(reply: FastifyReply) {
  const { cookie } = config;
  reply.clearCookie(cookie.access, { path: cookie.path });
  reply.clearCookie(cookie.refresh, { path: cookie.path });
}
