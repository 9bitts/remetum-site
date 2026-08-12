import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { config, livekitConfigured } from "../config.js";

export { livekitConfigured };

function livekitHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^ws/, "http");
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

  const apiKey = config.livekit.apiKey.trim();
  const apiSecret = config.livekit.apiSecret.trim();

  const at = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: input.ttlSeconds ?? 60 * 60,
  });

  at.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  if (typeof token !== "string" || token.length < 20) {
    throw new Error("Falha ao gerar token LiveKit");
  }
  return token;
}

export async function ensureLivekitRoom(roomName: string) {
  if (!livekitConfigured()) return;
  const url = config.livekit.url.trim();
  const svc = new RoomServiceClient(
    livekitHttpUrl(url),
    config.livekit.apiKey.trim(),
    config.livekit.apiSecret.trim(),
  );
  try {
    await svc.createRoom({
      name: roomName,
      maxParticipants: 4,
      emptyTimeout: 60 * 10,
    });
  } catch {
    // room may already exist
  }
}

export function getLivekitUrl() {
  const url = config.livekit.url.trim();
  return url || null;
}
