import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  getAllUsers,
  toggleUserStatus,
  adminUpdateUser,
  switchUserRole,
  getAllPosts,
  togglePostStatus,
  updatePostApproval,
  getAllApplications,
  getPostApplicants,
  deleteApplication,
  updateApplicationStatus,
  sendUserNotification,
  getPostReports,
  updatePostReportStatus,
} from "../controller/adminController";
import {
  createPostType,
  updatePostType,
  deletePostType,
} from "../controller/postTypeController";
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
import {
  getReferrals,
  createReferral,
  updateReferral,
  deleteReferral,
} from "../controller/referralController";

const router = Router();

// Protect all admin routes with authentication and check for ADMIN role
router.use(authenticate, authorize(["ADMIN"]));

router.get("/users", getAllUsers);
router.patch("/users/:id/toggle", toggleUserStatus);
router.patch("/users/:id/role", switchUserRole);
router.patch("/users/:id", adminUpdateUser);
router.post("/users/:id/notify", sendUserNotification);

router.get("/posts", getAllPosts);
router.get("/posts/:id/applicants", getPostApplicants);
router.patch("/posts/:id/toggle", togglePostStatus);
router.patch("/posts/:id/approval", updatePostApproval);

router.get("/applications", getAllApplications);
router.delete("/applications/:id", deleteApplication);
router.patch("/applications/:id/status", updateApplicationStatus);

// Post reports (user-submitted) review
router.get("/reports", getPostReports);
router.patch("/reports/:id", updatePostReportStatus);

// Post/employment type administration
router.post("/post-types", createPostType);
router.patch("/post-types/:id", updatePostType);
router.delete("/post-types/:id", deletePostType);

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

// Referral codes administration
router.get("/referrals", getReferrals);
router.post("/referrals", createReferral);
router.patch("/referrals/:id", updateReferral);
router.delete("/referrals/:id", deleteReferral);

export default router;

