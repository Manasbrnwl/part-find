import express from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { getUserCertificates, downloadCertificate } from "../controller/certificateController";

const router = express.Router();

router.use(authenticate);

// List all certificates for the authenticated user
router.get("/my-certificates", authorize(["USER"]), getUserCertificates);

// Download a specific certificate as PDF
router.get("/download/:id", authorize(["USER"]), downloadCertificate);

export default router;
