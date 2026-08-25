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

const router = express.Router();

// Public auth routes
router.post("/request-otp", requestOTP);
router.post("/verify-otp", verifyOTP);
router.post("/firebase-signin", loginGoogleUser);
router.post("/refresh", refreshTokens);

// Protected auth routes
router.post("/logout", authenticate, logout);
router.post("/logout-all", authenticate, logoutAll);
router.delete("/delete-profile", authenticate, deleteProfile);

export default router;
