import { Hono } from "hono";
import { authenticate } from "../middleware/authMiddleware";
import { sendTestNotification } from "../controller/notificationController";

const router = new Hono();

router.use("*", authenticate);

// Send a test push notification to the current user
router.post("/test", sendTestNotification);

export default router;
