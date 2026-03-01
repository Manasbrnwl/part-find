import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

// Import routes
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import postRoutes from "./routes/postRoutes";
import masterRoutes from "./routes/masterRoutes";
import ratingRoutes from "./routes/ratingRoutes";
import { sendFCMNotification } from "./utils/fcmSender";

const app = new Hono<{ Bindings: any }>();

// Middleware
app.use("*", cors());
app.use("*", logger());
app.use("*", prettyJSON());

// Routes
app.get("/", (c) => {
  return c.text("Hello, TypeScript with Hono on Cloudflare Workers!");
});

// Mount routes
app.route("/auth", authRoutes);
app.route("/users", userRoutes);
app.route("/post", postRoutes);
app.route("/master", masterRoutes);
app.route("/rating", ratingRoutes);

// Error handling is built-in but can be customized
app.onError((err, c) => {
  console.error(err);
  return c.text('Internal Server Error', 500);
});

app.notFound((c) => {
  return c.text('Not Found', 404);
});

// Configure standard fetch handling and queue processing
export default {
  fetch: app.fetch,

  async queue(batch: any, env: any): Promise<void> {
    for (const message of batch.messages) {
      try {
        const payload = message.body;
        console.log(`[Queue] Processing notification:`, payload.type);

        if (payload.fcmToken && payload.title) {
          await sendFCMNotification(
            env,
            payload.fcmToken,
            payload.title,
            payload.body || "",
            payload.data
          );
        }

        // Acknowledge the message so it is removed from the queue
        message.ack();
      } catch (error) {
        console.error("[Queue Error] Failed to process message:", error);
        // Message will be retried automatically if not ack'd
      }
    }
  }
};
