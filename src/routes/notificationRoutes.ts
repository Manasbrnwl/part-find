import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
    sendTestNotification,
    listNotifications,
    getUnreadCount,
    markAllNotificationsRead,
    markNotificationRead,
    deleteNotification,
} from "../controller/notificationController";

const router = express.Router();

router.use(authenticate);

// Send a test push notification to the current user
router.post("/test", sendTestNotification);

// In-app notification feed (last 7 days, read/unread state)
router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.delete("/:id", deleteNotification);

export default router;
