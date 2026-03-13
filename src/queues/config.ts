import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Redis connection configuration (supports Upstash via REDIS_URL or local via host/port)
const redisUrl = process.env.REDIS_URL;

let redisConnection: any;

if (redisUrl) {
  // Use connection URL (Upstash or any Redis URL)
  // Upstash requires TLS — URLs starting with rediss:// enable TLS automatically
  redisConnection = {
    ...parseRedisUrl(redisUrl),
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 30000); // Slower retries for Upstash
      return delay;
    },
    reconnectOnError(err: any) {
      const targetError = "ERR max requests limit exceeded";
      if (err.message.includes(targetError)) {
        console.warn("⚠️ Redis quota exceeded. Retrying later...");
        return false;
      }
      return true;
    }
  };
} else {
  // Fallback to host/port config (local Redis)
  redisConnection = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 15000);
      return delay;
    },
    // ioredis specific configuration to handle connection errors
    reconnectOnError(err: any) {
      const targetError = "ERR max requests limit exceeded";
      if (err.message.includes(targetError)) {
        console.warn("⚠️ Redis quota exceeded. Retrying in 1 minute...");
        return false; // Stop reconnecting immediately, wait for manual or retryStrategy
      }
      return true;
    }
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
