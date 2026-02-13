import { Hono } from "hono";
import { categoryLists } from "../controller/masterController";

const router = new Hono();

router.get("/category", categoryLists);

export default router;
