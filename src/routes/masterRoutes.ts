import express from "express";
import { categoryLists } from "../controller/masterController";

const router = express.Router();

router.get("/category", categoryLists);

export default router;
