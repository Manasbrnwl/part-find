import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  getAllUsers,
  getProfile,
  updateProfile,
  getRecruiterProfile,
  updateRecruiterProfile
} from "../controller/userController";
import multer from "multer";
import mime from "mime-types";
import { ensureDirExists } from "../../utils/default"; // Import the utility function to ensure the directory exists
import path from "path"; // Import the path module to work with file paths

const router = express.Router();
const prisma = new PrismaClient();

const files = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureDirExists("uploads/profile");
    cb(null, "uploads/profile");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = mime.extension(file.mimetype) || "bin";
    cb(null, file.fieldname + "-" + uniqueSuffix + "." + ext);
  }
});

const recruiterFiles = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureDirExists("uploads/recruiter");
    cb(null, "uploads/recruiter");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = mime.extension(file.mimetype) || "bin";
    cb(null, file.fieldname + "-" + uniqueSuffix + "." + ext);
  }
});

const file_storage = multer({ storage: files });
const recruiter_storage = multer({ storage: recruiterFiles });

router.use(authenticate); // Apply authentication middleware to all routes in this file

// User profile routes
router
  .get("/profile", getProfile)
  .put("/profile", file_storage.fields([{ name: "profile_image", maxCount: 5 }]), updateProfile);

// Recruiter profile routes
router
  .get("/recruiter-profile", authorize(["RECRUITER"]), getRecruiterProfile)
  .put("/recruiter-profile", authorize(["RECRUITER"]), recruiter_storage.fields([{ name: "companyLogo", maxCount: 1 }]), updateRecruiterProfile);

// Get all users (admin only)
router.get("/", authorize(["ADMIN"]), getAllUsers);

export default router;
