import { Worker, Job } from "bullmq";
import { redisConnection } from "./config";
import { logger } from "../../utils/logger";
const { sendEmailNotification, transporter } = require("../../utils/notification/email.notification");
import { lowRatingWarningTemplate, absentWarningTemplate, completionCertificateTemplate, generateCertificateHtml, otpEmailTemplate, inactiveReminderTemplate } from "../../utils/notification/emailTemplates";
import { logoAttachment } from "../../utils/notification/logoAsset";
import { sendFCMNotification, sendFCMToMultipleTokens } from "../../utils/firebase";
import {
    NotificationType,
    JobReminderData,
    RatingNotificationData,
    NewJobPostedData,
    NewApplicationData,
    ApplicationStatusData,
    LowRatingWarningData,
    AbsentWarningData,
    CompletionCertificateData,
    OtpEmailData,
    InactiveReminderData,
    queueInactiveReminder,
    scheduleInactiveUserScan,
} from "./notificationQueue";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let notificationWorker: Worker | null = null;
let otpEmailWorker: Worker | null = null;

/**
 * Process job reminder notification
 */
async function processJobReminder(data: JobReminderData) {
    if (!data.fcmToken) {
        logger.warn(`No FCM token for user ${data.userId}, skipping notification`);
        return;
    }

    await sendFCMNotification(data.fcmToken, {
        title: "📅 Event Reminder",
        body: `Your job "${data.postTitle}" starts tomorrow at ${data.location}`,
        reminderId: data.postId,
        type: NotificationType.JOB_REMINDER,
    });

    logger.info(`Job reminder sent to user ${data.userId}`);
}

/**
 * Process rating received notification
 */
async function processRatingNotification(data: RatingNotificationData) {
    if (!data.fcmToken) {
        logger.warn(`No FCM token for user ${data.userId}, skipping notification`);
        return;
    }

    const stars = "⭐".repeat(data.rating);

    await sendFCMNotification(data.fcmToken, {
        title: "⭐ You received a rating!",
        body: `${data.recruiterName} rated you ${stars} for "${data.postTitle}"`,
        reminderId: data.userId,
        type: NotificationType.RATING_RECEIVED,
    });

    logger.info(`Rating notification sent to user ${data.userId}`);
}

/**
 * Process new job posted notification — broadcasts to all users with FCM tokens
 */
async function processNewJobPosted(data: NewJobPostedData) {
    if (!data.fcmTokens.length) {
        logger.warn("No FCM tokens available, skipping new job notification");
        return;
    }

    await sendFCMToMultipleTokens(data.fcmTokens, {
        title: "🆕 New Event Posted!",
        body: `"${data.postTitle}" at ${data.companyName || "a company"} in ${data.location || "TBD"}`,
        reminderId: data.postId,
        type: NotificationType.NEW_JOB_POSTED,
    });

    logger.info(`New job notification broadcast to ${data.fcmTokens.length} users`);
}

/**
 * Process new application notification — sent to the recruiter
 */
async function processNewApplication(data: NewApplicationData) {
    if (!data.recruiterFcmToken) {
        logger.warn("No FCM token for recruiter, skipping application notification");
        return;
    }

    await sendFCMNotification(data.recruiterFcmToken, {
        title: "📋 New Application!",
        body: `${data.applicantName} applied for "${data.postTitle}"`,
        reminderId: data.postId,
        type: NotificationType.NEW_APPLICATION,
    });

    logger.info(`Application notification sent to recruiter for post ${data.postId}`);
}

/**
 * Process application status notification — sent to the applicant when a
 * recruiter/admin approves or rejects their application.
 */
async function processApplicationStatus(data: ApplicationStatusData) {
    if (!data.fcmToken) {
        logger.warn(`No FCM token for user ${data.userId}, skipping status notification`);
        return;
    }

    const approved = String(data.status).toUpperCase() === "APPROVED";
    const by = data.recruiterName ? ` by ${data.recruiterName}` : "";

    await sendFCMNotification(data.fcmToken, {
        title: approved ? "🎉 You're selected!" : "Application update",
        body: approved
            ? `Great news! Your application for "${data.postTitle}" was approved${by}.`
            : `Your application for "${data.postTitle}" was not selected this time.`,
        reminderId: data.userId,
        type: NotificationType.APPLICATION_STATUS,
    });

    logger.info(`Application status (${data.status}) notification sent to user ${data.userId}`);
}

/**
 * Process low rating warning notification
 */
async function processLowRatingWarning(data: LowRatingWarningData) {
    // 1. Send FCM Notification if token is available
    if (data.fcmToken) {
        await sendFCMNotification(data.fcmToken, {
            title: "⚠️ Important Account Warning",
            body: `We've noticed several low ratings on your profile recently. Please check your email for details.`,
            reminderId: data.userId,
            type: NotificationType.LOW_RATING_WARNING,
        });
        logger.info(`Low rating FCM warning sent to user ${data.userId}`);
    }

    // 2. Send Email Notification
    const { subject, text, html } = lowRatingWarningTemplate(data.userName);
    await sendEmailNotification(data.userEmail, subject, text, html);
    logger.info(`Low rating email warning sent to ${data.userEmail}`);
}

/**
 * Process absent warning notification
 */
async function processAbsentWarning(data: AbsentWarningData) {
    // 1. Send FCM Notification if token is available
    if (data.fcmToken) {
        await sendFCMNotification(data.fcmToken, {
            title: "⚠️ Attendance Warning",
            body: `You were marked as absent for "${data.postTitle}". This can affect your profile standing.`,
            reminderId: data.userId,
            type: NotificationType.ABSENT_WARNING,
        });
        logger.info(`Absent FCM warning sent to user ${data.userId}`);
    }

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
    await sendEmailNotification(data.email, subject, text, html);
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

    // 2. Send FCM push notification
    if (data.fcmToken) {
        await sendFCMNotification(data.fcmToken, {
            title: "🏆 Certificate Earned!",
            body: `You've earned a certificate for "${data.postTitle}"!`,
            reminderId: data.userId,
            type: NotificationType.COMPLETION_CERTIFICATE,
        });
        logger.info(`Certificate FCM sent to user ${data.userId}`);
    }

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
    // Disabled by default. This can mass-send and overwhelm the SMTP provider
    // (GoDaddy Workspace has a low daily limit) — only run when explicitly
    // enabled AND capped per run. Re-enable only with a provider that can take
    // the volume (e.g. SES/SendGrid) and appropriate throttling.
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
 * Send a re-engagement reminder to one inactive user (email + push), then
 * stamp last_reminded_at so they aren't reminded again this streak.
 */
async function processInactiveReminder(data: InactiveReminderData) {
    let delivered = false;

    // Email
    if (data.userEmail) {
        const { subject, text, html } = inactiveReminderTemplate(data.userName, data.role);
        const ok = await sendEmailNotification(data.userEmail, subject, text, html);
        delivered = delivered || ok === true;
    }

    // Push
    if (data.fcmToken) {
        const isRecruiter = String(data.role).toUpperCase() === "RECRUITER";
        const pushOk = await sendFCMNotification(data.fcmToken, {
            title: isRecruiter ? "Your next hire is a tap away 👋" : "New gigs are waiting 👋",
            body: isRecruiter
                ? "Post a gig and start receiving applications today."
                : "Fresh opportunities are live — come find your next gig.",
            reminderId: data.userId,
            type: NotificationType.INACTIVE_USER_REMINDER,
        }).then(() => true).catch((err) => {
            logger.warn(`Inactive push failed for ${data.userId}: ${err?.message}`);
            return false;
        });
        delivered = delivered || pushOk === true;
    }

    // Only mark as reminded if something actually went out — otherwise a broken
    // channel would silently "remind" everyone without delivering anything.
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
