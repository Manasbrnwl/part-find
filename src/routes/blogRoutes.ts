import { Router } from "express";
import { getAllBlogs, getBlogById } from "../controller/blogController";

const router = Router();

router.get("/", getAllBlogs);
router.get("/:id", getBlogById);

export default router;
