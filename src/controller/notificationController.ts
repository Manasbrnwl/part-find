import { Context } from "hono";
import {
    handleValidationError,
    handleNotFoundError,
    handleControllerError,
} from "../utils/errorHandler";
import { sendFCMNotification } from "../utils/firebase";
import { getPrisma } from "../lib/prisma";

/**
 * Send a test push notification to the current user
 * Useful for verifying FCM setup and token validity
 */
export const sendTestNotification = async (c: Context) => {
    try {
        const prisma = getPrisma(c.env);
        const userId = c.get("userId");

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

        const success = await sendFCMNotification(user.fcm_token, {
            title: "🔔 Test Notification",
            body: `Hello ${user.name || "there"}! Your notifications are working correctly.`,
            reminderId: userId,
            type: "TEST_NOTIFICATION",
        });

        if (!success) {
            return c.json({
                success: false,
                message: "Failed to send notification. FCM token may be invalid or expired.",
            }, 500);
        }

        return c.json({
            success: true,
            message: "Test notification sent successfully",
        });
    } catch (error) {
        return handleControllerError(error, c);
    }
};
