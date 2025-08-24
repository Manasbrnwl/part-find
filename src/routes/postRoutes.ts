import express from "express";
import {
  createPosts,
  updatePost,
  deletePost,
  getAllPosts,
  getPostById,
  getAppliedPosts,
  applyToPost
} from "../controller/postController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticate);
router.use(authorize(["admin", "recruiter"]));

router.post("/", createPosts);
router.put("/update/:id", updatePost);
router.delete("/delete/:id", deletePost);
router.get("/get-all", getAllPosts);
router.get("/:id", getPostById);
router.get("/applied/get-all", getAppliedPosts);
router.post("/apply/:id", applyToPost);


export default router;
