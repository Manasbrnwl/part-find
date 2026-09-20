import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import {
  listMyThreads,
  myUnreadCount,
  threadForApplication,
  getThread,
  listMessages,
  sendMessage,
  markRead,
} from "../controller/chatController";

const router = Router();

// Recruiter ↔ applicant chat. Both sides use the same endpoints; the server
// works out which side of the thread the caller is on.
router.use(authenticate, authorize(["USER", "RECRUITER", "ADMIN"]));

router.get("/threads", listMyThreads);
router.get("/unread-count", myUnreadCount);
router.get("/threads/by-application/:applicationId", threadForApplication);
router.get("/threads/:id", getThread);
router.get("/threads/:id/messages", listMessages);
router.post("/threads/:id/messages", sendMessage);
router.post("/threads/:id/read", markRead);

export default router;
