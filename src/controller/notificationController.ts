import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import {
    handleValidationError,
    handleNotFoundError,
    asyncHandler,
} from "../utils/errorHandler";
import { sendFCMNotification } from "../../utils/firebase";
import { NotificationType } from "../queues/notificationQueue";
import { storeNotification, retentionCutoff, NOTIFICATION_RETENTION_DAYS } from "../utils/notificationStore";

const prisma = new PrismaClient();

/**
 * Send a test push notification to the current user
 * Useful for verifying FCM setup and token validity
 */
export const sendTestNotification = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw handleValidationError("User ID is required");
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fcm_token: true, name: true },
    });

    if (!user) {
        throw handleNotFoundError("User");
    }

    if (!user.fcm_token) {
        throw handleValidationError(
            "No FCM token found for this user. Please update your FCM token first."
        );
    }

    const title = "🔔 Test Notification";
    const body = `Hello ${user.name || "there"}! Your notifications are working correctly.`;

    // Stored too, so the test also exercises the in-app feed end to end.
    const stored = await storeNotification({
        userId,
        type: NotificationType.TEST_NOTIFICATION,
        title,
        body,
    });

    const result = await sendFCMNotification(user.fcm_token, {
        title,
        body,
        reminderId: userId,
        type: NotificationType.TEST_NOTIFICATION,
        notificationId: stored.id,
    });

    if (!result.success) {
        return res.status(500).json({
            success: false,
            message: `Failed to send notification: ${result.error || "FCM token may be invalid or expired."}`,
        });
    }

    res.status(200).json({
        success: true,
        message: "Test notification sent successfully",
        data: { notificationId: stored.id },
    });
});

/**
 * GET /notifications
 * The current user's notification feed (last NOTIFICATION_RETENTION_DAYS days),
 * newest first, paginated. Also returns the unread count so the app can badge
 * the bell without a second request.
 * Query: page, limit, unread=true (only unread)
 */
export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { page = 1, limit = 20, unread } = req.query;

    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 100);
    const onlyUnread = String(unread) === "true";

    const baseWhere = { userId, createdAt: { gte: retentionCutoff() } };
    const where = onlyUnread ? { ...baseWhere, is_read: false } : baseWhere;

    const [items, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (pageNumber - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                postId: true,
                data: true,
                is_read: true,
                read_at: true,
                createdAt: true,
            },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { ...baseWhere, is_read: false } }),
    ]);

    res.status(200).json({
        success: true,
        message: "Notifications retrieved successfully",
        data: {
            list: items,
            unreadCount,
            retentionDays: NOTIFICATION_RETENTION_DAYS,
            totalPages: Math.ceil(total / pageSize),
            currentPage: pageNumber,
            total,
        },
    });
});

/**
 * GET /notifications/unread-count
 * Lightweight badge endpoint for the app's bell icon.
 */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
    const unreadCount = await prisma.notification.count({
        where: { userId: req.userId!, is_read: false, createdAt: { gte: retentionCutoff() } },
    });

    res.status(200).json({
        success: true,
        message: "Unread count retrieved successfully",
        data: { unreadCount },
    });
});

/**
 * PATCH /notifications/read-all
 * Mark every unread notification of the current user as read.
 */
export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
    const { count } = await prisma.notification.updateMany({
        where: { userId: req.userId!, is_read: false },
        data: { is_read: true, read_at: new Date() },
    });

    res.status(200).json({
        success: true,
        message: "All notifications marked as read",
        data: { updated: count },
    });
});

/**
 * PATCH /notifications/:id/read
 * Mark one notification as read (e.g. when the user taps it). Idempotent.
 */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!id) {
        throw handleValidationError("Notification ID is required");
    }

    // Scoped to the caller so a user can't mark someone else's notification.
    const existing = await prisma.notification.findFirst({
        where: { id, userId: req.userId! },
        select: { id: true, is_read: true },
    });
    if (!existing) {
        throw handleNotFoundError("Notification");
    }

    const updated = existing.is_read
        ? existing
        : await prisma.notification.update({
              where: { id },
              data: { is_read: true, read_at: new Date() },
              select: { id: true, is_read: true, read_at: true },
          });

    res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data: updated,
    });
});

/**
 * DELETE /notifications/:id
 * Remove one notification from the caller's feed.
 */
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!id) {
        throw handleValidationError("Notification ID is required");
    }

    const { count } = await prisma.notification.deleteMany({
        where: { id, userId: req.userId! },
    });
    if (!count) {
        throw handleNotFoundError("Notification");
    }

    res.status(200).json({
        success: true,
        message: "Notification deleted successfully",
    });
});
