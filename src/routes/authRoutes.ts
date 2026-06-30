import express from "express";
import {
  loginGoogleUser,
  requestOTP,
  verifyOTP,
  logout,
  deleteProfile,
  refreshTokens,
  logoutAll
} from "../controller/authController";
import { authenticate } from "../middleware/authMiddleware";

import { authLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// Public auth routes
router.post("/request-otp", authLimiter, requestOTP);
router.post("/verify-otp", authLimiter, verifyOTP);
router.post("/firebase-signin", authLimiter, loginGoogleUser);
router.post("/refresh", refreshTokens);

// Protected auth routes
router.post("/logout", authenticate, logout);
router.post("/logout-all", authenticate, logoutAll);
router.delete("/delete-profile", authenticate, deleteProfile);

export default router;
