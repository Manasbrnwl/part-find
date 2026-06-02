import { Router } from "express";
import { getClients, getTestimonials } from "../controller/websiteController";

const router = Router();

router.get("/clients", getClients);
router.get("/testimonials", getTestimonials);

export default router;
