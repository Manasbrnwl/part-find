import { PrismaClient } from "@prisma/client";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import postRoutes from "./routes/postRoutes";
import masterRoutes from "./routes/masterRoutes";
import ratingRoutes from "./routes/ratingRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { startNotificationWorker } from "./queues/notificationWorker";
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';


dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

try {
  const swaggerPath = path.join(process.cwd(), 'swagger.yml');
  const swaggerDoc = YAML.load(swaggerPath);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (error) {
  console.error("Failed to load swagger documentation:", error);
}

// Routes
app.get("/", (_req, res) => {
  res.send("Hello, TypeScript with Node.js!");
});

// Auth routes
app.use("/auth", authRoutes);
// User routes
app.use("/users", userRoutes);
// Post routes
app.use("/post", postRoutes);
// Master routes
app.use("/master", masterRoutes);
// Rating routes
app.use("/rating", ratingRoutes);
// Notification routes
app.use("/notifications", notificationRoutes);

// Legacy route - consider migrating this to proper controller pattern
app.use("/seed", require("./routes/user"));

// Fetch image from profile folder
app.use("/images", express.static("uploads/profile"));

// Handle 404
app.use((_req, res) => {
  res.status(404).json({ message: "Not Found" });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Start notification worker
try {
  startNotificationWorker();
} catch (err) {
  console.error("Failed to start notification worker:", err);
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
