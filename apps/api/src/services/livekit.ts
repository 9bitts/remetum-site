import { AccessToken } from "livekit-server-sdk";
import { config, livekitConfigured } from "../config.js";

export { livekitConfigured };

export async function createLivekitToken(input: {
  roomName: string;
  identity: string;
  name: string;
  ttlSeconds?: number;
}) {
  if (!livekitConfigured()) {
    throw new Error("LiveKit is not configured");
  }

  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
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

  return at.toJwt();
}

export function getLivekitUrl() {
  return config.livekit.url || null;
}
