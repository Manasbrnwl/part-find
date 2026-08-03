import { PrismaClient } from "@prisma/client";
import { logger } from "../../utils/logger";
import { sendFCMNotification } from "../../utils/firebase";
import { winBackStudentTemplate, winBackRecruiterTemplate } from "../../utils/notification/emailTemplates";
import { NotificationType } from "../queues/notificationQueue";
const { sendEmailNotification } = require("../../utils/notification/email.notification");

const prisma = new PrismaClient();

// Tune these two to change who gets targeted and how often.
const INACTIVITY_THRESHOLD_DAYS = 5;
const WIN_BACK_COOLDOWN_DAYS = 1;

const BATCH_SIZE = 100;
const SEND_CONCURRENCY = 5;
const MAX_BATCHES_PER_RUN = 50; // safety cap: 50 * 100 = 5,000 users/run

async function withConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
    let cursor = 0;
    async function runNext(): Promise<void> {
        const index = cursor++;
        if (index >= items.length) return;
        await worker(items[index]);
        return runNext();
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

async function sendWinBackToUser(user: {
    id: string;
    name: string | null;
    email: string;
    fcm_token: string | null;
    role: string | null;
}) {
    const displayName = user.name || "there";
    const isRecruiter = user.role === "RECRUITER";
    const { subject, text, html } = isRecruiter
        ? winBackRecruiterTemplate(displayName)
        : winBackStudentTemplate(displayName);

    try {
        await sendEmailNotification(user.email, subject, text, html);
    } catch (err) {
        logger.error(`Win-back email failed for user ${user.id}`, { error: err });
    }

    if (user.fcm_token) {
        try {
            await sendFCMNotification(user.fcm_token, {
                title: isRecruiter ? "Your next event deserves great staff" : "We miss you on Part Find!",
                body: isRecruiter
                    ? "New verified staff are joining every week — post your next requirement."
                    : "New gigs are being added every week. Come see what's waiting for you.",
                reminderId: user.id,
                type: NotificationType.WIN_BACK_SWEEP,
            });
        } catch (err) {
            logger.error(`Win-back push failed for user ${user.id}`, { error: err });
        }
    }
}

/**
 * Find users who've been inactive for INACTIVITY_THRESHOLD_DAYS+ and
 * haven't received a win-back email in the last WIN_BACK_COOLDOWN_DAYS,
 * then send them a re-engagement email (+ push if they have an FCM token).
 *
 * Paginates by re-running the same query without `skip`: each processed
 * batch has lastWinBackEmailAt bumped, so it naturally falls out of the
 * WHERE clause and the next `take` picks up the next unprocessed users —
 * this avoids the classic skip/offset pagination bug where updating rows
 * that match the filter shifts the result set out from under `skip`.
 */
export async function runWinBackSweep() {
    const inactivityCutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const cooldownCutoff = new Date(Date.now() - WIN_BACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    let totalProcessed = 0;

    for (let batchNum = 0; batchNum < MAX_BATCHES_PER_RUN; batchNum++) {
        const batch = await prisma.user.findMany({
            where: {
                is_active: true,
                role: { in: ["USER", "RECRUITER"] },
                AND: [
                    {
                        OR: [
                            { lastActiveAt: { lte: inactivityCutoff } },
                            { lastActiveAt: null, createdAt: { lte: inactivityCutoff } },
                        ],
                    },
                    {
                        OR: [
                            { lastWinBackEmailAt: null },
                            { lastWinBackEmailAt: { lte: cooldownCutoff } },
                        ],
                    },
                ],
            },
            take: BATCH_SIZE,
            select: { id: true, name: true, email: true, fcm_token: true, role: true },
        });

        if (batch.length === 0) break;

        await withConcurrency(batch, SEND_CONCURRENCY, sendWinBackToUser);

        await prisma.user.updateMany({
            where: { id: { in: batch.map((u) => u.id) } },
            data: { lastWinBackEmailAt: new Date() },
        });

        totalProcessed += batch.length;

        if (batch.length < BATCH_SIZE) break;
    }

    logger.info(`Win-back sweep complete: ${totalProcessed} users emailed`);
    return totalProcessed;
}
