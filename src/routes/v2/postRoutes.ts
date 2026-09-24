import express from "express";
import { authenticate, authorize } from "../../middleware/authMiddleware";
import { createPosts, updatePost } from "../../controller/postController";
import { getAllPostsV2 } from "../../controller/v2/postController";

const router = express.Router();

router.use(authenticate);

// GET /api/v2/post/get-all — candidate feed with the event state + recruiter details
router.get("/get-all", authorize(["USER"]), getAllPostsV2);

// Create / update deliberately reuse the v1 handlers: accepting `event_state`
// was an additive change, so the behaviour is identical and there is no second
// copy of the validation, notification and approval logic to keep in sync.
// Only the paths are tidied up here (no "/update" segment), and if v2 ever
// needs to diverge it can be split out then.
// POST /api/v2/post
router.post("/", authorize(["ADMIN", "RECRUITER"]), createPosts);
// PUT /api/v2/post/:id
router.put("/:id", authorize(["ADMIN", "RECRUITER"]), updatePost);

export default router;
