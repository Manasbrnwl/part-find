import { Router } from "express";
import { getClients, getTestimonials, getFeaturedJobs } from "../controller/websiteController";

const router = Router();

router.get("/clients", getClients);
router.get("/testimonials", getTestimonials);
router.get("/jobs", getFeaturedJobs);

export default router;
