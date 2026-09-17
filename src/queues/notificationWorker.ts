import { Worker, Job } from "bullmq";
import { redisConnection } from "./config";
import { logger } from "../../utils/logger";
const { sendEmailNotification, transporter } = require("../../utils/notification/email.notification");
import { lowRatingWarningTemplate, absentWarningTemplate, completionCertificateTemplate, generateCertificateHtml, otpEmailTemplate, postApprovedTemplate } from "../../utils/notification/emailTemplates";
import { logoAttachment } from "../../utils/notification/logoAsset";
import { sendFCMToMultipleTokens } from "../../utils/firebase";
import { notifyUser, storeNotifications, purgeExpiredNotifications, retentionCutoff } from "../utils/notificationStore";
import {
    NotificationType,
    JobReminderData,
    RatingNotificationData,
    NewJobPostedData,
    PostApprovedData,
    NewApplicationData,
    ApplicationStatusData,
    LowRatingWarningData,
    AbsentWarningData,
    CompletionCertificateData,
    OtpEmailData,
    InactiveReminderData,
    ApplicationNotSelectedData,
    queueInactiveReminder,
    queueApplicationNotSelected,
    scheduleInactiveUserScan,
    scheduleDailyMaintenance,
} from "./notificationQueue";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let notificationWorker: Worker | null = null;
let otpEmailWorker: Worker | null = null;

/**
 * Process job reminder notification
 */
async function processJobReminder(data: JobReminderData) {
    const { pushed } = await notifyUser({
        userId: data.userId,
        fcmToken: data.fcmToken,
        type: NotificationType.JOB_REMINDER,
        title: "📅 Event Reminder",
        body: `Your job "${data.postTitle}" starts tomorrow at ${data.location}`,
        postId: data.postId,
    });

    logger.info(`Job reminder stored for user ${data.userId} (pushed=${pushed})`);
}

/**
 * Process rating received notification
 */
async function processRatingNotification(data: RatingNotificationData) {
    const stars = "⭐".repeat(data.rating);

    const { pushed } = await notifyUser({
        userId: data.userId,
        fcmToken: data.fcmToken,
        type: NotificationType.RATING_RECEIVED,
        title: "⭐ You received a rating!",
        body: `${data.recruiterName} rated you ${stars} for "${data.postTitle}"`,
        data: { rating: data.rating, recruiterName: data.recruiterName },
    });

    logger.info(`Rating notification stored for user ${data.userId} (pushed=${pushed})`);
}

/**
 * Process new job posted notification — broadcasts to all users with FCM tokens
 */
async function processNewJobPosted(data: NewJobPostedData) {
    const title = "🆕 New Event Posted!";
    const body = `"${data.postTitle}" at ${data.companyName || "a company"} in ${data.location || "TBD"}`;

    // 1. In-app feed row for every recipient (device or not)
    const userIds = data.userIds ?? [];
    if (userIds.length) {
        const stored = await storeNotifications(
            userIds.map((userId) => ({
                userId,
                type: NotificationType.NEW_JOB_POSTED,
                title,
                body,
                postId: data.postId,
            }))
        );
        logger.info(`New job notification stored for ${stored} users`);
    }

    // 2. Push to the devices we know about
    if (!data.fcmTokens.length) {
        logger.warn("No FCM tokens available, skipping new job push");
        return;
    }

    await sendFCMToMultipleTokens(data.fcmTokens, {
        title,
        body,
        reminderId: data.postId,
        type: NotificationType.NEW_JOB_POSTED,
        postId: data.postId,
    });

    logger.info(`New job notification broadcast to ${data.fcmTokens.length} devices`);
}

/**
 * Process new application notification — sent to the recruiter
 */
async function processNewApplication(data: NewApplicationData) {
    const { pushed } = await notifyUser({
        userId: data.recruiterId,
        fcmToken: data.recruiterFcmToken,
        type: NotificationType.NEW_APPLICATION,
        title: "📋 New Application!",
        body: `${data.applicantName} applied for "${data.postTitle}"`,
        postId: data.postId,
        data: { applicantName: data.applicantName },
    });

    logger.info(`Application notification stored for recruiter ${data.recruiterId} (pushed=${pushed})`);
}

/**
 * Process post-approved notification — sent to the recruiter (post owner) when
 * an admin approves their job post. Delivers a push notification and an email.
 */
async function processPostApproved(data: PostApprovedData) {
    // 1. In-app row + push notification
    const { pushed } = await notifyUser({
        userId: data.recruiterId,
        fcmToken: data.fcmToken,
        type: NotificationType.POST_APPROVED,
        title: "✅ Your job post is live!",
        body: `"${data.postTitle}" was approved and is now visible to candidates.`,
        postId: data.postId,
    });
    logger.info(`Post-approved notification stored for recruiter ${data.recruiterId} (pushed=${pushed})`);

    // 2. Email
    if (data.recruiterEmail) {
        const { subject, text, html } = postApprovedTemplate(data.recruiterName, data.postTitle);
        await sendEmailNotification(data.recruiterEmail, subject, text, html);
        logger.info(`Post-approved email sent to ${data.recruiterEmail}`);
    }
}

/**
 * Process application status notification — sent to the applicant when a
 * recruiter/admin approves or rejects their application.
 */
async function processApplicationStatus(data: ApplicationStatusData) {
    const approved = String(data.status).toUpperCase() === "APPROVED";
    const by = data.recruiterName ? ` by ${data.recruiterName}` : "";

    const { pushed } = await notifyUser({
        userId: data.userId,
        fcmToken: data.fcmToken,
        type: NotificationType.APPLICATION_STATUS,
        title: approved ? "🎉 You're selected!" : "Better luck next time 🍀",
        body: approved
            ? `Great news! Your application for "${data.postTitle}" was approved${by}.`
            : `You weren't selected for "${data.postTitle}" this time. Don't give up — new gigs are posted every day!`,
        postId: data.postId,
        data: {
            status: data.status,
            applicationId: data.applicationId,
            ...(data.rejectReason ? { rejectReason: data.rejectReason } : {}),
        },
    });

    logger.info(`Application status (${data.status}) notification stored for user ${data.userId} (pushed=${pushed})`);
}

/**
 * "Better luck next time" for applicants who were still PENDING when a post
 * closed recruitment or reached its start date. Skips anyone who already has a
 * decision-type notification for this post within the retention window, so
 * re-closing a post (or the daily sweep overlapping a manual close) can't
 * notify the same person twice.
 */
async function processApplicationNotSelected(data: ApplicationNotSelectedData) {
    if (!data.applicants.length) return;

    const already = await prisma.notification.findMany({
        where: {
            postId: data.postId,
            type: { in: [NotificationType.APPLICATION_NOT_SELECTED, NotificationType.APPLICATION_STATUS] },
            userId: { in: data.applicants.map((a) => a.userId) },
            createdAt: { gte: retentionCutoff() },
        },
        select: { userId: true },
    });
    const alreadyNotified = new Set(already.map((n) => n.userId));

    const body =
        data.reason === "closed"
            ? `"${data.postTitle}" has finished selecting candidates and you weren't picked this time. Keep applying — your next gig is out there!`
            : `"${data.postTitle}" has started and your application wasn't selected. Better luck next time — new gigs are posted every day!`;

    let sent = 0;
    for (const applicant of data.applicants) {
        if (alreadyNotified.has(applicant.userId)) continue;
        await notifyUser({
            userId: applicant.userId,
            fcmToken: applicant.fcmToken,
            type: NotificationType.APPLICATION_NOT_SELECTED,
            title: "Better luck next time 🍀",
            body,
            postId: data.postId,
            data: { applicationId: applicant.applicationId, reason: data.reason },
        });
        sent++;
    }

    logger.info(`Not-selected notifications: ${sent} sent, ${alreadyNotified.size} already notified (post ${data.postId})`);
}

/**
 * Process low rating warning notification
 */
async function processLowRatingWarning(data: LowRatingWarningData) {
    // 1. In-app row + push (if a device is registered)
    const { pushed } = await notifyUser({
        userId: data.userId,
        fcmToken: data.fcmToken,
        type: NotificationType.LOW_RATING_WARNING,
        title: "⚠️ Important Account Warning",
        body: `We've noticed several low ratings on your profile recently. Please check your email for details.`,
    });
    logger.info(`Low rating warning stored for user ${data.userId} (pushed=${pushed})`);

    // 2. Send Email Notification
    const { subject, text, html } = lowRatingWarningTemplate(data.userName);
    await sendEmailNotification(data.userEmail, subject, text, html);
    logger.info(`Low rating email warning sent to ${data.userEmail}`);
}

/**
 * Process absent warning notification
 */
async function processAbsentWarning(data: AbsentWarningData) {
    // 1. In-app row + push (if a device is registered)
    const { pushed } = await notifyUser({
        userId: data.userId,
        fcmToken: data.fcmToken,
        type: NotificationType.ABSENT_WARNING,
        title: "⚠️ Attendance Warning",
        body: `You were marked as absent for "${data.postTitle}". This can affect your profile standing.`,
    });
    logger.info(`Absent warning stored for user ${data.userId} (pushed=${pushed})`);

    // 2. Send Email Notification
    const { subject, text, html } = absentWarningTemplate(data.userName, data.postTitle);
    await sendEmailNotification(data.userEmail, subject, text, html);
    logger.info(`Absent email warning sent to ${data.userEmail}`);
}

/**
 * Process an OTP email send
 */
async function processOtpEmail(data: OtpEmailData) {
    const { subject, text, html } = otpEmailTemplate(data.otp, data.expiryMinutes);
    const ok = await sendEmailNotification(data.email, subject, text, html);
    if (!ok) {
        // Throw so BullMQ marks the job failed and retries — and so the logs
        // don't falsely claim the OTP was sent when SMTP actually rejected it.
        throw new Error(`OTP email to ${data.email} failed on all mail accounts`);
    }
    logger.info(`OTP email sent to ${data.email}`);
}

/**
 * Process completion certificate notification
 */
async function processCompletionCertificate(data: CompletionCertificateData) {
    const issuedAt = new Date(data.issuedAt);

    // 1. Generate PDF (headless Chrome). Race against a hard timeout so a hung
    //    render fails fast instead of stalling the worker and jamming the queue.
    const htmlContent = generateCertificateHtml(data.userName, data.postTitle, data.rating, data.recruiterName, issuedAt);
    const htmlPdfNode = require("html-pdf-node");
    const pdfBuffer: Buffer = await Promise.race([
        new Promise<Buffer>((resolve, reject) => {
            htmlPdfNode.generatePdf(
                { content: htmlContent },
                { format: "A4", landscape: true, printBackground: true },
                (err: Error | null, buffer: Buffer) => {
                    if (err) reject(err);
                    else resolve(buffer);
                }
            );
        }),
        new Promise<Buffer>((_, reject) =>
            setTimeout(() => reject(new Error("Certificate PDF generation timed out")), 45000)
        ),
    ]);

    // 2. In-app row + push notification
    const { pushed } = await notifyUser({
        userId: data.userId,
        fcmToken: data.fcmToken,
        type: NotificationType.COMPLETION_CERTIFICATE,
        title: "🏆 Certificate Earned!",
        body: `You've earned a certificate for "${data.postTitle}"!`,
        data: { rating: data.rating },
    });
    logger.info(`Certificate notification stored for user ${data.userId} (pushed=${pushed})`);

    // 3. Send email with PDF attachment
    const { subject, text, html } = completionCertificateTemplate(data.userName, data.postTitle, data.rating, data.recruiterName, issuedAt);
    await transporter.sendMail({
        from: `Part Find <${process.env.EMAIL_USER}>`,
        to: data.userEmail,
        subject,
        text,
        html,
        attachments: [
            logoAttachment(), // inline brand logo (cid:partfind-logo)
            {
                filename: `certificate-${data.postTitle.slice(0, 20).replace(/\s+/g, "-")}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
            },
        ],
    });
    logger.info(`Certificate email with PDF sent to ${data.userEmail}`);
}

/**
 * Scan for users who have been inactive past the threshold and enqueue a
 * re-engagement reminder for each. Runs on a daily schedule.
 *
 * A user is reminded at most once per inactivity streak: once we remind them,
 * last_reminded_at moves past last_active_at, so they won't be picked again
 * until they return (which advances last_active_at) and go idle once more.
 */
async function processInactiveScan() {
    // Off by default — gated behind INACTIVE_REMINDER_ENABLED and capped per run.
    // Reminders go out via PUSH (Firebase), so there's no SMTP/mailbox limit to
    // worry about; the cap just keeps each run bounded.
    if (process.env.INACTIVE_REMINDER_ENABLED !== "true") {
        logger.info("Inactive scan skipped (INACTIVE_REMINDER_ENABLED != 'true')");
        return;
    }
    const days = parseInt(process.env.INACTIVE_REMINDER_DAYS || "5", 10);
    const maxPerRun = parseInt(process.env.INACTIVE_REMINDER_MAX_PER_RUN || "50", 10);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const candidates = await prisma.user.findMany({
        where: {
            is_active: true,
            role: { in: ["USER", "RECRUITER"] },
            last_active_at: { not: null, lt: cutoff },
            fcm_token: { not: null }, // push-only: skip users we can't reach by push
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            fcm_token: true,
            last_active_at: true,
            last_reminded_at: true,
        },
        orderBy: { last_active_at: "asc" },
        take: maxPerRun * 4,
    });

    // Only those not already reminded for the current inactivity streak,
    // hard-capped so a single run can never flood the mail provider.
    const toRemind = candidates
        .filter((u) => !u.last_reminded_at || (u.last_active_at && u.last_reminded_at < u.last_active_at))
        .slice(0, maxPerRun);

    logger.info(`Inactive scan: ${candidates.length} idle >${days}d, ${toRemind.length} to remind (cap ${maxPerRun})`);

    for (const u of toRemind) {
        await queueInactiveReminder({
            userId: u.id,
            userName: u.name,
            userEmail: u.email,
            role: u.role,
            fcmToken: u.fcm_token,
        });
    }
}

/**
 * Send a re-engagement reminder to one inactive user via PUSH notification, then
 * stamp last_reminded_at so they aren't reminded again this streak.
 * (Push only — no email — so it doesn't depend on the SMTP mailbox.)
 */
async function processInactiveReminder(data: InactiveReminderData) {
    let delivered = false;

    if (data.fcmToken) {
        const isRecruiter = String(data.role).toUpperCase() === "RECRUITER";
        const { pushed } = await notifyUser({
            userId: data.userId,
            fcmToken: data.fcmToken,
            type: NotificationType.INACTIVE_USER_REMINDER,
            title: isRecruiter ? "Your next hire is a tap away 👋" : "New gigs are waiting 👋",
            body: isRecruiter
                ? "Post a gig and start receiving applications today."
                : "Fresh opportunities are live — come find your next gig.",
        });
        delivered = pushed;
    } else {
        logger.warn(`Inactive reminder skipped for ${data.userId} — no FCM token`);
    }

    // Only mark as reminded if the push actually went out — otherwise a user we
    // couldn't reach would be silently marked and never nudged.
    if (delivered) {
        await prisma.user.update({
            where: { id: data.userId },
            data: { last_reminded_at: new Date() },
        });
        logger.info(`Inactive reminder sent to user ${data.userId}`);
    } else {
        logger.warn(`Inactive reminder NOT delivered for ${data.userId} — leaving eligible`);
    }
}

/**
 * Daily housekeeping (DB-only, always on):
 *  1. Purge notifications past the retention window (default 7 days).
 *  2. Sweep posts whose start date passed in the last 48h and tell any applicant
 *     still PENDING "better luck next time". The 48h window overlaps the daily
 *     cadence so a missed run doesn't skip a post; the worker de-dupes against
 *     notifications already stored (retention window is much longer than 48h).
 */
async function processDailyMaintenance() {
    await purgeExpiredNotifications();

    const now = new Date();
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const startedPosts = await prisma.post.findMany({
        where: {
            is_active: true,
            approval_status: "APPROVED",
            startDate: { gte: windowStart, lte: now },
            comments: { some: { status: "PENDING" } },
        },
        select: {
            id: true,
            title: true,
            comments: {
                where: { status: "PENDING" },
                select: { id: true, userId: true, user: { select: { fcm_token: true } } },
            },
        },
    });

    for (const post of startedPosts) {
        await queueApplicationNotSelected({
            postId: post.id,
            postTitle: post.title,
            reason: "started",
            applicants: post.comments.map((a) => ({
                userId: a.userId,
                applicationId: a.id,
                fcmToken: a.user.fcm_token,
            })),
        });
    }

    logger.info(`Daily maintenance: ${startedPosts.length} started post(s) with pending applicants swept`);
}

export function startNotificationWorker() {
    if (notificationWorker) return notificationWorker;

    try {
        logger.info("Initializing notification worker...");
        notificationWorker = new Worker(
            "notifications",
            async (job: Job) => {
                logger.info(`Processing notification job: ${job.name} (${job.id})`);

                switch (job.name) {
                    case NotificationType.JOB_REMINDER:
                        await processJobReminder(job.data as JobReminderData);
                        break;

                    case NotificationType.RATING_RECEIVED:
                        await processRatingNotification(job.data as RatingNotificationData);
                        break;

                    case NotificationType.NEW_JOB_POSTED:
                        await processNewJobPosted(job.data as NewJobPostedData);
                        break;

                    case NotificationType.POST_APPROVED:
                        await processPostApproved(job.data as PostApprovedData);
                        break;

                    case NotificationType.NEW_APPLICATION:
                        await processNewApplication(job.data as NewApplicationData);
                        break;

                    case NotificationType.APPLICATION_STATUS:
                        await processApplicationStatus(job.data as ApplicationStatusData);
                        break;

                    case NotificationType.LOW_RATING_WARNING:
                        await processLowRatingWarning(job.data as LowRatingWarningData);
                        break;

                    case NotificationType.ABSENT_WARNING:
                        await processAbsentWarning(job.data as AbsentWarningData);
                        break;

                    case NotificationType.COMPLETION_CERTIFICATE:
                        await processCompletionCertificate(job.data as CompletionCertificateData);
                        break;

                    case NotificationType.OTP_EMAIL:
                        await processOtpEmail(job.data as OtpEmailData);
                        break;

                    case NotificationType.INACTIVE_SCAN:
                        await processInactiveScan();
                        break;

                    case NotificationType.INACTIVE_USER_REMINDER:
                        await processInactiveReminder(job.data as InactiveReminderData);
                        break;

                    case NotificationType.APPLICATION_NOT_SELECTED:
                        await processApplicationNotSelected(job.data as ApplicationNotSelectedData);
                        break;

                    case NotificationType.DAILY_MAINTENANCE:
                        await processDailyMaintenance();
                        break;

                    default:
                        logger.warn(`Unknown notification type: ${job.name}`);
                }
            },
            {
                connection: redisConnection,
                concurrency: 1, // Single worker to minimize Redis polling
                lockDuration: 300000, // 5 min — generous lock to avoid stale-check overhead
                stalledInterval: 600000, // 10 min — reduces periodic Redis stale-job checks
                maxStalledCount: 1,
                drainDelay: 30000, // 30 seconds — idle poll interval (was 60ms, the main quota killer)
            }
        );

        // Worker event listeners
        notificationWorker.on("completed", (job) => {
            logger.info(`Job ${job.id} completed successfully`);
        });

        notificationWorker.on("failed", (job, err) => {
            logger.error(`Job ${job?.id} failed`, { error: err.message });
        });

        notificationWorker.on("error", (err) => {
            const errorMsg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
            if (errorMsg.includes("max requests limit exceeded")) {
                logger.warn("Worker standby: Redis limit reached.");
            } else {
                logger.error("Worker error", { error: errorMsg, details: err });
            }
        });

        notificationWorker.on("ready", () => {
            logger.info("Notification worker is ready and connected");
        });

        // Dedicated OTP-email worker on its own queue, isolated from the heavy
        // notification jobs above. Higher concurrency and light (SMTP-only) work
        // so account-critical login codes are never blocked or delayed.
        if (!otpEmailWorker) {
            otpEmailWorker = new Worker(
                "otp-emails",
                async (job: Job) => {
                    logger.info(`Processing OTP email job (${job.id})`);
                    await processOtpEmail(job.data as OtpEmailData);
                },
                {
                    connection: redisConnection,
                    concurrency: 5,
                    lockDuration: 60000,
                    drainDelay: 5000,
                }
            );
            otpEmailWorker.on("failed", (job, err) => {
                logger.error(`OTP email job ${job?.id} failed`, { error: err.message });
            });
            otpEmailWorker.on("error", (err) => {
                logger.error("OTP email worker error", { error: err.message });
            });
            otpEmailWorker.on("ready", () => {
                logger.info("OTP email worker is ready and connected");
            });
            logger.info("OTP email worker initialized");
        }

        // Always-on daily housekeeping: notification retention + unselected sweep.
        scheduleDailyMaintenance().catch((err) =>
            logger.error("Failed to schedule daily maintenance", { error: err?.message })
        );

        // Register the recurring inactive-user scan ONLY when explicitly enabled.
        // Off by default to avoid mass-sending through a rate-limited SMTP provider.
        if (process.env.INACTIVE_REMINDER_ENABLED === "true") {
            scheduleInactiveUserScan().catch((err) =>
                logger.error("Failed to schedule inactive-user scan", { error: err?.message })
            );
        } else {
            logger.info("Inactive-user scan not scheduled (INACTIVE_REMINDER_ENABLED != 'true')");
        }

        return notificationWorker;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("Failed to start notification worker", { error: errMsg });
        return null;
    }
}
