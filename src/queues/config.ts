import Redis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../../utils/logger";

dotenv.config();

// Redis connection configuration (supports Upstash via REDIS_URL or local via host/port)
const redisUrl = process.env.REDIS_URL;

interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest: null;
  retryStrategy: (times: number) => number;
  reconnectOnError: (err: Error) => boolean;
}

let redisConnection: RedisConnectionConfig;

if (redisUrl) {
  redisConnection = {
    ...parseRedisUrl(redisUrl),
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      return Math.min(times * 200, 30000);
    },
    reconnectOnError(err: Error) {
      if (err.message.includes("ERR max requests limit exceeded")) {
        logger.warn("Redis quota exceeded. Retrying later...");
        return false;
      }
      return true;
    },
  };
} else {
  redisConnection = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      return Math.min(times * 100, 15000);
    },
    reconnectOnError(err: Error) {
      if (err.message.includes("ERR max requests limit exceeded")) {
        logger.warn("Redis quota exceeded. Retrying in 1 minute...");
        return false;
      }
      return true;
    },
  };
}

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  const useTls = parsed.protocol === "rediss:";
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    ...(useTls ? { tls: {} } : {}),
  };
}

export { redisConnection };
