import express, { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  getAllUsers,
  getProfile,
  updateProfile,
  getRecruiterProfile,
  updateRecruiterProfile,
  updateFcmToken,
} from "../controller/userController";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { ensureDirExists } from "../../utils/default";

const router = express.Router();
const prisma = new PrismaClient();

// Use memoryStorage so we can compress with sharp before writing to disk
const memoryUpload = multer({ storage: multer.memoryStorage() });

/**
 * Compress and save images using sharp.
 * - JPEG/JPG/WEBP: resize to max 1200px wide, 80% quality
 * - PNG: convert to JPEG  at 80% quality (reduces file size significantly)
 * - GIF/other: pass through as-is
 */
async function compressAndSave(
  file: Express.Multer.File,
  destDir: string
): Promise<string> {
  ensureDirExists(destDir);
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  // Always output as JPEG for consistent compression
  const filename = `${file.fieldname}-${uniqueSuffix}.jpg`;
  const filePath = path.join(destDir, filename);

  await sharp(file.buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(filePath);

  return filename;
}

/** Middleware: compress user profile images before they reach the controller */
async function compressProfileImages(req: Request, _res: Response, next: NextFunction) {
  const files = req.files as { profile_image?: Express.Multer.File[] } | undefined;
  if (!files?.profile_image?.length) return next();

  const destDir = path.join(process.env.UPLOAD_DIR || "uploads", "profile");

  for (const file of files.profile_image) {
    try {
      const savedFilename = await compressAndSave(file, destDir);
      // Mutate the multer file object so downstream controller finds the saved filename
      file.filename = savedFilename;
      file.path = path.join(destDir, savedFilename);
    } catch {
      return next(new Error(`Failed to process image: ${file.originalname}`));
    }
  }
  next();
}

/** Middleware: compress recruiter logo */
async function compressLogoImage(req: Request, _res: Response, next: NextFunction) {
  const files = req.files as { companyLogo?: Express.Multer.File[] } | undefined;
  if (!files?.companyLogo?.length) return next();

  const destDir = path.join(process.env.UPLOAD_DIR || "uploads", "recruiter");

  try {
    const savedFilename = await compressAndSave(files.companyLogo[0], destDir);
    files.companyLogo[0].filename = savedFilename;
    files.companyLogo[0].path = path.join(destDir, savedFilename);
  } catch {
    return next(new Error("Failed to process company logo"));
  }
  next();
}

router.use(authenticate);

// User profile routes
router
  .get("/profile", getProfile)
  .put(
    "/profile",
    memoryUpload.fields([{ name: "profile_image", maxCount: 5 }]),
    compressProfileImages,
    updateProfile
  );

// Recruiter profile routes
router
  .get("/recruiter-profile", authorize(["RECRUITER"]), getRecruiterProfile)
  .put(
    "/recruiter-profile",
    authorize(["RECRUITER"]),
    memoryUpload.fields([{ name: "companyLogo", maxCount: 1 }]),
    compressLogoImage,
    updateRecruiterProfile
  );

// Get all users (admin only)
router.get("/", authorize(["ADMIN"]), getAllUsers);

// FCM token management
router.put("/fcm-token", updateFcmToken);

export default router;
