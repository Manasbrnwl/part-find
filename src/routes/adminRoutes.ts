import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  getAllUsers,
  toggleUserStatus,
  getAllPosts,
  togglePostStatus,
  getAllApplications,
  deleteApplication,
  updateApplicationStatus,
} from "../controller/adminController";
import {
  createBlog,
  getAdminBlogs,
  updateBlog,
  deleteBlog,
} from "../controller/blogController";

const router = Router();

// Protect all admin routes with authentication and check for ADMIN role
router.use(authenticate, authorize(["ADMIN"]));

router.get("/users", getAllUsers);
router.patch("/users/:id/toggle", toggleUserStatus);

router.get("/posts", getAllPosts);
router.patch("/posts/:id/toggle", togglePostStatus);

router.get("/applications", getAllApplications);
router.delete("/applications/:id", deleteApplication);
router.patch("/applications/:id/status", updateApplicationStatus);

// Blog administration
router.get("/blogs", getAdminBlogs);
router.post("/blogs", createBlog);
router.patch("/blogs/:id", updateBlog);
router.delete("/blogs/:id", deleteBlog);

export default router;

