import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { sendTestNotification } from "../controller/notificationController";

const router = express.Router();

router.use(authenticate);

// Send a test push notification to the current user
router.post("/test", sendTestNotification);

export default router;
