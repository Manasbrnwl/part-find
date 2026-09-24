import express from "express";
import { authenticate, authorize } from "../../middleware/authMiddleware";
import { getAllPostsV2 } from "../../controller/v2/postController";

const router = express.Router();

router.use(authenticate);

// GET /api/v2/post/get-all — candidate job feed with recruiter details
router.get("/get-all", authorize(["USER"]), getAllPostsV2);

export default router;
