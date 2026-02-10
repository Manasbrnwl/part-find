import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

// Create Redis connection
export const redis = new Redis(redisConnection);

redis.on("connect", () => {
  console.log("✅ Redis connected for BullMQ");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message);
});

export { redisConnection };
