import { SignJWT } from "jose";
import { RoomServiceClient } from "livekit-server-sdk";
import { config, livekitConfigured } from "../config.js";

export { livekitConfigured };

function livekitHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^ws/, "http");
}

function credentials() {
  return {
    url: config.livekit.url.trim(),
    apiKey: config.livekit.apiKey.trim(),
    apiSecret: config.livekit.apiSecret.trim(),
  };
}

export async function createLivekitToken(input: {
  roomName: string;
  identity: string;
  name: string;
  ttlSeconds?: number;
}) {
  if (!livekitConfigured()) {
    throw new Error("LiveKit is not configured");
  }

  const { apiKey, apiSecret } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 60 * 30;

  const token = await new SignJWT({
    video: {
      roomJoin: true,
      room: input.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomCreate: false,
    },
    name: input.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(apiKey)
    .setSubject(input.identity)
    .setNotBefore(now - 60)
    .setExpirationTime(now + ttl)
    .sign(new TextEncoder().encode(apiSecret));

  if (typeof token !== "string" || token.length < 20) {
    throw new Error("Falha ao gerar token LiveKit");
  }
  return token;
}

function getRoomService() {
  const { url, apiKey, apiSecret } = credentials();
  return new RoomServiceClient(livekitHttpUrl(url), apiKey, apiSecret);
}

export async function ensureLivekitRoom(roomName: string) {
  if (!livekitConfigured()) return;
  const svc = getRoomService();
  try {
    await svc.createRoom({
      name: roomName,
      maxParticipants: 4,
      emptyTimeout: 60 * 10,
    });
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (/exist/i.test(message)) return;
    if (/unauthorized|invalid|api key|403|401/i.test(message)) {
      throw Object.assign(
        new Error(
          `Credenciais LiveKit inválidas no servidor (${message}). Confira LIVEKIT_* no Railway.`,
        ),
        { statusCode: 503 },
      );
    }
  }
}

export async function verifyLivekitCredentials() {
  if (!livekitConfigured()) {
    return {
      ok: false as const,
      error: "LIVEKIT_* não configurado",
    };
  }
  try {
    const svc = getRoomService();
    await svc.listRooms();
    return {
      ok: true as const,
      url: credentials().url,
    };
  } catch (err) {
    return {
      ok: false as const,
      url: credentials().url,
      error: (err as Error).message,
    };
  }
}

export function getLivekitUrl() {
  return credentials().url || null;
}
