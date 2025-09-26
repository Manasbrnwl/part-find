import express from "express";
import {
  loginGoogleUser,
  requestOTP,
  verifyOTP
} from "../controller/authController";

const router = express.Router();

// Auth routes
router.post("/request-otp", requestOTP);
router.post("/verify-otp", verifyOTP);

//Third party login route
router.post("/firebase-signin", loginGoogleUser);

export default router;
