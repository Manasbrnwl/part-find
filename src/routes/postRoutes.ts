import { Hono } from "hono";
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
  recruiterGetPost,
  savePost,
  getSavePosts,
  getNearbyPosts
} from "../controller/postController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = new Hono();

router.use("*", authenticate);

router.post("/", authorize(["ADMIN", "RECRUITER"]), createPosts);
router.put("/update/:id", authorize(["ADMIN", "RECRUITER"]), updatePost);
router.delete("/delete/:id", authorize(["ADMIN", "RECRUITER"]), deletePost);
router.get("/applied/get-all", authorize(["USER"]), getAppliedPosts);
router.post("/apply/:id", authorize(["USER"]), applyToPost);
router.post("/list/:id", authorize(["ADMIN", "RECRUITER"]), listPosts);
router.put("/update-status/:id", authorize(["RECRUITER"]), updateUserStatus);
router.get("/get-all-post", authorize(["RECRUITER"]), recruiterGetPost);
router.get("/nearby", authorize(["USER"]), getNearbyPosts);
router.get("/get-all", authorize(["USER"]), getAllPosts);
router.get("/:id", authorize(["USER"]), getPostById);
router.post("/save/:postId", authorize(["USER"]), savePost);
router.get("/save/get-all", authorize(["USER"]), getSavePosts);

export default router;
