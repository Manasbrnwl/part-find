import express from "express";
import { getTerms, getPrivacy, getLegal } from "../controller/legalController";

const router = express.Router();

// Public legal content endpoints
router.get("/", getLegal);
router.get("/terms-conditions", getTerms);
router.get("/privacy-policy", getPrivacy);

export default router;
