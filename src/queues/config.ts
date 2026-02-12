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
  };
} else {
  // Fallback to host/port config (local Redis)
  redisConnection = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
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

// Create Redis connection
export const redis = new Redis(redisConnection);

redis.on("connect", () => {
  console.log("✅ Redis connected for BullMQ");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message);
});

export { redisConnection };
