import { Worker, Job } from "bullmq";
import { redisConnection } from "./config";
import { logger } from "../../utils/logger";
const { sendEmailNotification } = require("../../utils/notification/email.notification");
import { lowRatingWarningTemplate, absentWarningTemplate, completionCertificateTemplate, generateCertificateHtml } from "../../utils/notification/emailTemplates";
import { sendFCMNotification, sendFCMToMultipleTokens } from "../../utils/firebase";
import {
    NotificationType,
    JobReminderData,
    RatingNotificationData,
    NewJobPostedData,
    NewApplicationData,
    LowRatingWarningData,
    AbsentWarningData,
    CompletionCertificateData,
} from "./notificationQueue";

let notificationWorker: Worker | null = null;

/**
 * Process job reminder notification
 */
async function processJobReminder(data: JobReminderData) {
    if (!data.fcmToken) {
        logger.warn(`No FCM token for user ${data.userId}, skipping notification`);
        return;
    }

    await sendFCMNotification(data.fcmToken, {
        title: "📅 Job Reminder",
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
        title: "🆕 New Job Posted!",
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
 * Process completion certificate notification
 */
async function processCompletionCertificate(data: CompletionCertificateData) {
    const issuedAt = new Date(data.issuedAt);

    // 1. Generate PDF
    const htmlContent = generateCertificateHtml(data.userName, data.postTitle, data.rating, data.recruiterName, issuedAt);
    const htmlPdfNode = require("html-pdf-node");
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
        htmlPdfNode.generatePdf(
            { content: htmlContent },
            { format: "A4", landscape: true, printBackground: true },
            (err: Error | null, buffer: Buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            }
        );
    });

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
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
        from: `Part Find <${process.env.EMAIL_USER}>`,
        to: data.userEmail,
        subject,
        text,
        html,
        attachments: [{
            filename: `certificate-${data.postTitle.slice(0, 20).replace(/\s+/g, "-")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
        }],
    });
    logger.info(`Certificate email with PDF sent to ${data.userEmail}`);
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
                    
                    case NotificationType.LOW_RATING_WARNING:
                        await processLowRatingWarning(job.data as LowRatingWarningData);
                        break;
                    
                    case NotificationType.ABSENT_WARNING:
                        await processAbsentWarning(job.data as AbsentWarningData);
                        break;

                    case NotificationType.COMPLETION_CERTIFICATE:
                        await processCompletionCertificate(job.data as CompletionCertificateData);
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

        return notificationWorker;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("Failed to start notification worker", { error: errMsg });
        return null;
    }
}
