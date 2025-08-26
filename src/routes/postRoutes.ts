import express from "express";
import {
  createPosts,
  updatePost,
  deletePost,
  getAllPosts,
  getPostById,
  getAppliedPosts,
  applyToPost,
  listPosts,
  updateUserStatus
} from "../controller/postController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticate);

router.post("/", authorize(["admin", "recruiter"]), createPosts);
router.put("/update/:id", authorize(["admin", "recruiter"]), updatePost);
router.delete("/delete/:id", authorize(["admin", "recruiter"]), deletePost);
router.get("/get-all", authorize(["user"]), getAllPosts);
router.get("/:id", authorize(["user"]), getPostById);
router.get("/applied/get-all", authorize(["user"]), getAppliedPosts);
router.post("/apply/:id", authorize(["user"]), applyToPost);
router.post("/list/:id", authorize(["admin", "recruiter"]), listPosts);
router.put("/update-status/:id", authorize(["recruiter"]), updateUserStatus);

export default router;
