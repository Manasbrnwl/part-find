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
  deleteUserImage,
  getProfileCompletion,
  updateAadhaar,
  getMyAadhaarImage,
  getAadhaarImageByAdmin,
} from "../controller/userController";
import multer from "multer";
import sharp from "sharp";
import { storeImage } from "../lib/storage";

const router = express.Router();
const prisma = new PrismaClient();

// Use memoryStorage so we can compress with sharp before storing
const memoryUpload = multer({ storage: multer.memoryStorage() });

/**
 * Compress an uploaded image with sharp and store it under the given category
 * (S3 key prefix, or local subdir in fallback mode). Returns the stored filename.
 * - resize to max 1200px wide, re-encode as progressive JPEG at 80% quality
 */
async function compressAndStore(
  file: Express.Multer.File,
  category: string
): Promise<string> {
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const filename = `${file.fieldname}-${uniqueSuffix}.jpg`;

  const buffer = await sharp(file.buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();

  await storeImage(category, filename, buffer, "image/jpeg");
  return filename;
}

/** Middleware: compress + store user profile images before the controller */
async function compressProfileImages(req: Request, _res: Response, next: NextFunction) {
  const files = req.files as { profile_image?: Express.Multer.File[] } | undefined;
  if (!files?.profile_image?.length) return next();

  for (const file of files.profile_image) {
    try {
      // Mutate the multer file so the controller finds the stored filename
      file.filename = await compressAndStore(file, "profile");
    } catch {
      return next(new Error(`Failed to process image: ${file.originalname}`));
    }
  }
  next();
}

/**
 * Middleware: compress + store the Aadhaar image under the PRIVATE "aadhaar"
 * category. Only reachable via the authenticated aadhaar routes.
 */
async function compressAadhaarImage(req: Request, _res: Response, next: NextFunction) {
  const files = req.files as { aadhaar_image?: Express.Multer.File[] } | undefined;
  if (!files?.aadhaar_image?.length) return next();

  try {
    files.aadhaar_image[0].filename = await compressAndStore(files.aadhaar_image[0], "aadhaar");
  } catch {
    return next(new Error("Failed to process Aadhaar image"));
  }
  next();
}

/** Middleware: compress + store the recruiter logo */
async function compressLogoImage(req: Request, _res: Response, next: NextFunction) {
  const files = req.files as { companyLogo?: Express.Multer.File[] } | undefined;
  if (!files?.companyLogo?.length) return next();

  try {
    files.companyLogo[0].filename = await compressAndStore(files.companyLogo[0], "recruiter");
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

// Profile completion percentage
router.get("/profile/completion", getProfileCompletion);

// Aadhaar (KYC) — any authenticated role.
// PUT submits/updates the number + image; the image is stored in a private dir
// and is only retrievable through the authenticated GET routes below.
router.put(
  "/aadhaar",
  memoryUpload.fields([{ name: "aadhaar_image", maxCount: 1 }]),
  compressAadhaarImage,
  updateAadhaar
);
router.get("/aadhaar/image", getMyAadhaarImage);
router.get("/aadhaar/image/:userId", authorize(["ADMIN"]), getAadhaarImageByAdmin);

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

// User image management
router.delete("/images/:id", deleteUserImage);

export default router;
