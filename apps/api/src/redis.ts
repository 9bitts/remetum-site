import { Redis } from "ioredis";
import { config } from "./config.js";

let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (!config.redisUrl) return null;
  if (client === undefined) {
    try {
      client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 4_000,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      });
      void client.connect().catch((err) => {
        console.error("[redis] connect failed", err);
      });
    } catch (err) {
      console.error("[redis] init failed", err);
      client = null;
    }
  }
  return client;
}

export function redisEnabled() {
  return Boolean(config.redisUrl);
}
