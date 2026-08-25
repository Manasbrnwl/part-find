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
import certificateRoutes from "./routes/certificateRoutes";
import versionRoutes from "./routes/versionRoutes";
import enquiryRoutes from "./routes/enquiryRoutes";
import adminRoutes from "./routes/adminRoutes";
import blogRoutes from "./routes/blogRoutes";
import websiteRoutes from "./routes/websiteRoutes";
import legalRoutes from "./routes/legalRoutes";
import referralRoutes from "./routes/referralRoutes";
import imageRoutes from "./routes/imageRoutes";
import { startNotificationWorker } from "./queues/notificationWorker";
import { logger, morganStream } from "../utils/logger";
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';


dotenv.config({ override: true });

const app = express();
app.set("trust proxy", 1);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(morgan("dev", { stream: morganStream }));

try {
  const swaggerPath = path.join(process.cwd(), 'swagger.yml');
  const swaggerDoc = YAML.load(swaggerPath);
  app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (error) {
  logger.error("Failed to load swagger documentation", { error });
}

// Routes
app.get("/", (_req, res) => {
  res.send("Hello, TypeScript with Node.js!");
});

// Auth routes
app.use("/api/v1/auth", authRoutes);
// User routes
app.use("/api/v1/users", userRoutes);
// Post routes
app.use("/api/v1/post", postRoutes);
// Master routes
app.use("/api/v1/master", masterRoutes);
// Rating routes
app.use("/api/v1/rating", ratingRoutes);
// Notification routes
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/certificate", certificateRoutes);
app.use("/api/v1/version", versionRoutes);
app.use("/api/v1/enquiries", enquiryRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/blogs", blogRoutes);
app.use("/api/v1/website", websiteRoutes);
app.use("/api/v1/legal", legalRoutes);
app.use("/api/v1/referral", referralRoutes);


// Legacy route - consider migrating this to proper controller pattern
app.use("/api/v1/seed", require("./routes/user"));

// Image serving — proxies profile/recruiter images from S3 (or local disk in
// fallback mode). Same /api/v1/images/... URLs as before, so clients are unchanged.
app.use("/api/v1/images", imageRoutes);

// Handle 404
app.use((_req, res) => {
  res.status(404).json({ message: "Not Found" });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  res.status(500).send("Something broke!");
});

// Start notification worker
try {
  startNotificationWorker();
} catch (err) {
  logger.error("Failed to start notification worker", { error: err });
}

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on PORT ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
