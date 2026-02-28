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

const app = new Hono();

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

export default app;
