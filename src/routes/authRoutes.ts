import { Hono } from "hono";
import {
  requestOTP,
  verifyOTP,
  logout,
  deleteProfile,
  refreshTokens,
  logoutAll,
  loginGoogleUser
} from "../controller/authController";
import { authenticate } from "../middleware/authMiddleware";

const auth = new Hono();

// Public auth routes
auth.post("/request-otp", requestOTP);
auth.post("/verify-otp", verifyOTP);
auth.post("/refresh", refreshTokens);
auth.post("/firebase-signin", loginGoogleUser);

// Protected auth routes
auth.post("/logout", authenticate, logout);
auth.post("/logout-all", authenticate, logoutAll);
auth.delete("/delete-profile", authenticate, deleteProfile);

export default auth;
