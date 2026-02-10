import express from "express";
import {
    createRating,
    getUserRatings,
    getAverageRating,
    getJobRatings,
} from "../controller/ratingController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticate);

// Create rating (recruiters only)
router.post("/:postId/:userId", authorize(["RECRUITER"]), createRating);

// Get ratings for a user (public for logged-in users)
router.get("/user/:userId", getUserRatings);

// Get average rating for a user
router.get("/average/:userId", getAverageRating);

// Get all ratings for a job (recruiter who owns the job only)
router.get("/job/:postId", authorize(["RECRUITER"]), getJobRatings);

export default router;
