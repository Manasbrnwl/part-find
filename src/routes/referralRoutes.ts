import { Router } from "express";
import { validateReferral } from "../controller/referralController";

const router = Router();

// Public: let the signup screen check a referral code before submitting.
router.get("/validate/:code", validateReferral);

export default router;
