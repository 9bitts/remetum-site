import type { Redis } from "ioredis";
import { config } from "./config.js";

let client: Redis | null | undefined;
let loading: Promise<Redis | null> | null = null;

export async function getRedis(): Promise<Redis | null> {
  if (!config.redisUrl) return null;
  if (client) return client;
  if (client === null) return null;
  if (loading) return loading;

  loading = (async () => {
    try {
      const mod = await import("ioredis");
      const RedisCtor = (mod.default ?? mod.Redis) as unknown as {
        new (
          url: string,
          options: {
            maxRetriesPerRequest: number;
            enableReadyCheck: boolean;
            lazyConnect: boolean;
            connectTimeout: number;
            retryStrategy: (times: number) => number | null;
          },
        ): Redis;
      };
      const redis = new RedisCtor(config.redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 4_000,
        retryStrategy: (times) =>
          times > 3 ? null : Math.min(times * 200, 1000),
      });
      await redis.connect().catch((err) => {
        console.error("[redis] connect failed", err);
      });
      client = redis;
      return redis;
    } catch (err) {
      console.error("[redis] init failed", err);
      client = null;
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export function redisEnabled() {
  return Boolean(config.redisUrl);
}
