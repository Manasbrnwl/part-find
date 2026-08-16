import { PrismaClient } from "@prisma/client";
import express from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = express.Router();
const prisma = new PrismaClient();

// SECURITY: this endpoint was previously unauthenticated and returned every
// user's FULL record (email, phone, otp, jwt_token, fcm_token, aadhaar, ...).
// It is now admin-only and returns an explicit, non-sensitive field selection.
router.get(
  "/get_users",
  authenticate,
  authorize(["ADMIN"]),
  async (_req, res) => {
    const data = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        role: true,
        is_active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ message: "All data fetched successfully", data });
  }
);

module.exports = router;
