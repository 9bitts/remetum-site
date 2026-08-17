import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
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
  const ttl = input.ttlSeconds ?? 60 * 30;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl,
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    roomCreate: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();
  if (typeof jwt !== "string" || jwt.length < 20) {
    throw new Error("Falha ao gerar token LiveKit");
  }
  return jwt;
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
      maxParticipants: 16,
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
    console.error("[livekit] createRoom failed", err);
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
