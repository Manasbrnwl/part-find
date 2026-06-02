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
import {
  createClient,
  updateClient,
  deleteClient,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
} from "../controller/websiteController";

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

// Clients administration
router.post("/clients", createClient);
router.patch("/clients/:id", updateClient);
router.delete("/clients/:id", deleteClient);

// Testimonials administration
router.post("/testimonials", createTestimonial);
router.patch("/testimonials/:id", updateTestimonial);
router.delete("/testimonials/:id", deleteTestimonial);

export default router;

