import express from "express";
import { createEnquiry } from "../controller/enquiryController";

const router = express.Router();

router.post("/", createEnquiry);

export default router;
