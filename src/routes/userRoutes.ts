import { Hono } from "hono";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  getAllUsers,
  getProfile,
  updateProfile,
  getRecruiterProfile,
  updateRecruiterProfile,
  updateFcmToken,
} from "../controller/userController";

const router = new Hono();

// Middleware
router.use("*", authenticate);

// User profile routes
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

// Recruiter profile routes
router.get("/recruiter-profile", authorize(["RECRUITER"]), getRecruiterProfile);
router.put("/recruiter-profile", authorize(["RECRUITER"]), updateRecruiterProfile);

// Get all users (admin only)
router.get("/", authorize(["ADMIN"]), getAllUsers);

// FCM token management
router.put("/fcm-token", updateFcmToken);

export default router;
