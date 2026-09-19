import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../../utils/logger";
import { sendFCMNotification } from "../../utils/firebase";


/** How long a notification stays in the feed before the daily purge removes it. */
export const NOTIFICATION_RETENTION_DAYS = parseInt(process.env.NOTIFICATION_RETENTION_DAYS || "7", 10);

export function retentionCutoff(): Date {
    return new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export interface StoredNotificationInput {
    userId: string;
    type: string;
    title: string;
    body: string;
    postId?: string | null;
    data?: Record<string, unknown> | null;
}

/**
 * Persist a single in-app notification for a user.
 */
export async function storeNotification(input: StoredNotificationInput) {
    return prisma.notification.create({
        data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            postId: input.postId ?? null,
            data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        },
    });
}

/**
 * Persist the same notification for many users in one round-trip (broadcasts).
 */
export async function storeNotifications(inputs: StoredNotificationInput[]) {
    if (!inputs.length) return 0;
    const result = await prisma.notification.createMany({
        data: inputs.map((i) => ({
            userId: i.userId,
            type: i.type,
            title: i.title,
            body: i.body,
            postId: i.postId ?? null,
            data: (i.data ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
    });
    return result.count;
}

/**
 * Store the notification for the user's in-app feed, then push it to their
 * device if they have an FCM token. The DB row is written FIRST so the feed is
 * complete even when the user has no device registered or the push fails; the
 * push carries the row id so the app can mark it read when tapped.
 *
 * Never throws on push failure — a dead token must not fail the whole job.
 */
export async function notifyUser(
    input: StoredNotificationInput & { fcmToken?: string | null }
): Promise<{ notificationId: string; pushed: boolean }> {
    const row = await storeNotification(input);

    let pushed = false;
    if (input.fcmToken) {
        const result = await sendFCMNotification(input.fcmToken, {
            title: input.title,
            body: input.body,
            reminderId: input.postId || input.userId,
            type: input.type,
            notificationId: row.id,
            ...(input.postId ? { postId: input.postId } : {}),
        }).catch((err) => {
            logger.warn(`Push failed for user ${input.userId} (${input.type}): ${err?.message}`);
            return { success: false };
        });
        pushed = result.success === true;
    }

    return { notificationId: row.id, pushed };
}

/**
 * Delete notifications older than the retention window. Called by the daily
 * maintenance job; the list endpoint also filters by the same cutoff so nothing
 * stale is ever shown between purges.
 */
export async function purgeExpiredNotifications(): Promise<number> {
    const { count } = await prisma.notification.deleteMany({
        where: { createdAt: { lt: retentionCutoff() } },
    });
    if (count > 0) {
        logger.info(`Purged ${count} notifications older than ${NOTIFICATION_RETENTION_DAYS} days`);
    }
    return count;
}
