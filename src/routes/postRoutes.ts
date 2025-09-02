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
  updateUserStatus,
  recruiterGetPost
} from "../controller/postController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticate);

router.post("/", authorize(["ADMIN", "RECRUITER"]), createPosts);
router.put("/update/:id", authorize(["ADMIN", "RECRUITER"]), updatePost);
router.delete("/delete/:id", authorize(["ADMIN", "RECRUITER"]), deletePost);
router.get("/applied/get-all", authorize(["USER"]), getAppliedPosts);
router.post("/apply/:id", authorize(["USER"]), applyToPost);
router.post("/list/:id", authorize(["ADMIN", "RECRUITER"]), listPosts);
router.put("/update-status/:id", authorize(["RECRUITER"]), updateUserStatus);
router.get("/get-all-post", authorize(["RECRUITER"]), recruiterGetPost)
router.get("/get-all", authorize(["USER"]), getAllPosts);
router.get("/:id", authorize(["USER"]), getPostById);


export default router;
