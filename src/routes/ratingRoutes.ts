import express from "express";
import {
    createRating,
    getUserRatings,
    getAverageRating,
    getJobRatings,
    createRecruiterRating,
    getRecruiterRatings,
    getRecruiterAverageRating,
} from "../controller/ratingController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticate);

// --- User Ratings (Recruiter rating a User) ---

// Create rating for a user (recruiters only)
router.post("/:postId/:userId", authorize(["RECRUITER"]), createRating);

// Get ratings for a user (public for logged-in users)
router.get("/user/:userId", getUserRatings);

// Get average rating for a user
router.get("/average/:userId", getAverageRating);

// Get all ratings for a job (recruiter who owns the job only)
router.get("/job/:postId", authorize(["RECRUITER"]), getJobRatings);

// --- Recruiter Ratings (User rating a Recruiter) ---

// Create rating for a recruiter (users only)
router.post("/recruiter/:postId", authorize(["USER"]), createRecruiterRating);

// Get ratings for a recruiter
router.get("/recruiter/:recruiterId", getRecruiterRatings);

// Get average rating for a recruiter
router.get("/recruiter/average/:recruiterId", getRecruiterAverageRating);

export default router;
