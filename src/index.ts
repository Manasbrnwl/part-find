import { PrismaClient } from "@prisma/client";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import postRoutes from "./routes/postRoutes";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

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

// Legacy route - consider migrating this to proper controller pattern
app.use("/seed", require("./routes/user"));

// Fetch image from profile folder
app.use("/images", express.static("uploads/profile"));

// Handle 404
app.use((_req, res) => {
  res.status(404).json({ message: "Not Found" });
});

// Error handling middleware
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
