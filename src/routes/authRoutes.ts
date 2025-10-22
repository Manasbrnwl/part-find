import express from "express";
import {
  loginGoogleUser,
  requestOTP,
  verifyOTP,
  logout,
  deleteProfile
} from "../controller/authController";
import { authenticate } from "../middleware/authMiddleware";

const router = express.Router();

// Public auth routes
router.post("/request-otp", requestOTP);
router.post("/verify-otp", verifyOTP);
router.post("/firebase-signin", loginGoogleUser);

// Protected auth routes
router.post("/logout", authenticate, logout);
router.delete("/delete-profile", authenticate, deleteProfile);

export default router;
