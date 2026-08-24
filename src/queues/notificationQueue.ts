import { Queue } from "bullmq";
import { redisConnection } from "./config";
import { logger } from "../../utils/logger";

export enum NotificationType {
    JOB_REMINDER = "JOB_REMINDER",
    RATING_RECEIVED = "RATING_RECEIVED",
    NEW_JOB_POSTED = "NEW_JOB_POSTED",
    NEW_APPLICATION = "NEW_APPLICATION",
    APPLICATION_STATUS = "APPLICATION_STATUS",
    LOW_RATING_WARNING = "LOW_RATING_WARNING",
    ABSENT_WARNING = "ABSENT_WARNING",
    COMPLETION_CERTIFICATE = "COMPLETION_CERTIFICATE",
    OTP_EMAIL = "OTP_EMAIL",
    INACTIVE_SCAN = "INACTIVE_SCAN",
    INACTIVE_USER_REMINDER = "INACTIVE_USER_REMINDER",
}

export interface InactiveReminderData {
    userId: string;
    userName: string | null;
    userEmail: string | null;
    role: string | null;
    fcmToken?: string | null;
}

export interface JobReminderData {
    userId: string;
    postId: string;
    postTitle: string;
    startDate: Date;
    location: string;
    fcmToken: string;
}

export interface RatingNotificationData {
    userId: string;
    postTitle: string;
    rating: number;
    recruiterName: string;
    fcmToken: string;
}

export interface NewJobPostedData {
    postId: string;
    postTitle: string;
    companyName: string;
    location: string;
    fcmTokens: string[];
}

export interface NewApplicationData {
    postId: string;
    postTitle: string;
    applicantName: string;
    recruiterFcmToken: string;
}

export interface ApplicationStatusData {
    userId: string;
    postTitle: string;
    status: string; // APPROVED | REJECTED
    recruiterName?: string;
    fcmToken: string;
}

export interface LowRatingWarningData {
    userId: string;
    userName: string;
    userEmail: string;
    fcmToken?: string;
}

export interface AbsentWarningData {
    userId: string;
    userName: string;
    userEmail: string;
    postTitle: string;
    fcmToken?: string;
}

export interface OtpEmailData {
    email: string;
    otp: string;
    expiryMinutes: number;
}

export interface CompletionCertificateData {
    userId: string;
    userName: string;
    userEmail: string;
    postTitle: string;
    rating: number | null; // null = participation/attendance certificate (unrated)
    recruiterName: string;
    issuedAt: string; // ISO string (serialized for queue)
    fcmToken?: string;
}

// Lazy-initialize queue to avoid opening a Redis connection on module import
let _notificationQueue: Queue | null = null;

function getNotificationQueue(): Queue {
    if (!_notificationQueue) {
        _notificationQueue = new Queue("notifications", {
            connection: redisConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000, // 5s initial backoff (reduces retry Redis churn)
                },
                removeOnComplete: true, // Remove immediately after completion
                removeOnFail: 10, // Keep only last 10 failed for debugging
            },
        });

        _notificationQueue.on("error", (err) => {
            logger.error("Notification queue error", { error: err });
        });

        logger.info("Notification queue initialized");
    }
    return _notificationQueue;
}

// Dedicated queue for OTP emails. Login codes are account-critical and must
// never be blocked behind heavy/slow notification jobs (PDF certificates, FCM
// broadcasts, etc.), so they run on their own queue + worker.
let _otpEmailQueue: Queue | null = null;

export function getOtpEmailQueue(): Queue {
    if (!_otpEmailQueue) {
        _otpEmailQueue = new Queue("otp-emails", {
            connection: redisConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 3000 },
                removeOnComplete: true,
                removeOnFail: 20,
            },
        });

        _otpEmailQueue.on("error", (err) => {
            logger.error("OTP email queue error", { error: err });
        });

        logger.info("OTP email queue initialized");
    }
    return _otpEmailQueue;
}

/**
 * Schedule a job reminder notification for 1 day before the job starts
 */
export async function scheduleJobReminder(data: JobReminderData) {
    const startDate = new Date(data.startDate);
    const reminderDate = new Date(startDate);
    reminderDate.setDate(reminderDate.getDate() - 1);
    reminderDate.setHours(9, 0, 0, 0);

    const delay = reminderDate.getTime() - Date.now();

    if (delay > 0) {
        await getNotificationQueue().add(
            NotificationType.JOB_REMINDER,
            data,
            {
                delay,
                jobId: `reminder-${data.postId}-${data.userId}`,
            }
        );
        logger.info(`Job reminder scheduled for ${reminderDate.toISOString()}`);
        return true;
    } else {
        logger.warn("Job starts too soon, no reminder scheduled");
        return false;
    }
}

/**
 * Queue an immediate rating notification
 */
export async function queueRatingNotification(data: RatingNotificationData) {
    await getNotificationQueue().add(
        NotificationType.RATING_RECEIVED,
        data,
        {
            jobId: `rating-${data.userId}-${Date.now()}`,
        }
    );
    logger.info(`Rating notification queued for user ${data.userId}`);
}

/**
 * Queue a new job posted notification for all users with FCM tokens
 */
export async function queueNewJobNotification(data: NewJobPostedData) {
    await getNotificationQueue().add(
        NotificationType.NEW_JOB_POSTED,
        data,
        {
            jobId: `new-job-${data.postId}-${Date.now()}`,
        }
    );
    logger.info(`New job notification queued for ${data.fcmTokens.length} users`);
}

/**
 * Queue a notification to the recruiter when a user applies
 */
export async function queueNewApplicationNotification(data: NewApplicationData) {
    await getNotificationQueue().add(
        NotificationType.NEW_APPLICATION,
        data,
        {
            jobId: `application-${data.postId}-${Date.now()}`,
        }
    );
    logger.info("Application notification queued for recruiter");
}

/**
 * Queue a notification to the applicant when a recruiter approves/rejects them
 */
export async function queueApplicationStatusNotification(data: ApplicationStatusData) {
    await getNotificationQueue().add(
        NotificationType.APPLICATION_STATUS,
        data,
        {
            jobId: `appstatus-${data.userId}-${Date.now()}`,
        }
    );
    logger.info(`Application status (${data.status}) notification queued for user ${data.userId}`);
}

/**
 * Queue a low rating warning for a user
 */
export async function queueLowRatingWarning(data: LowRatingWarningData) {
    await getNotificationQueue().add(
        NotificationType.LOW_RATING_WARNING,
        data,
        {
            jobId: `warning-${data.userId}-${Date.now()}`,
        }
    );
    logger.info(`Low rating warning queued for user ${data.userId}`);
}

/**
 * Queue an absent warning for a user
 */
export async function queueAbsentWarning(data: AbsentWarningData) {
    await getNotificationQueue().add(
        NotificationType.ABSENT_WARNING,
        data,
        {
            jobId: `absent-${data.userId}-${Date.now()}`,
        }
    );
    logger.info(`Absent warning queued for user ${data.userId}`);
}

/**
 * Queue an OTP email for immediate async delivery (keeps the request-otp
 * endpoint from blocking on the SMTP round-trip)
 */
export async function queueOtpEmail(data: OtpEmailData) {
    await getOtpEmailQueue().add(
        NotificationType.OTP_EMAIL,
        data,
        {
            jobId: `otp-${data.email}-${Date.now()}`,
        }
    );
    logger.info(`OTP email queued for ${data.email}`);
}

/**
 * Queue a completion certificate notification for a user
 */
export async function queueCompletionCertificate(data: CompletionCertificateData) {
    await getNotificationQueue().add(
        NotificationType.COMPLETION_CERTIFICATE,
        data,
        {
            jobId: `cert-${data.userId}-${data.postTitle.slice(0, 20)}-${Date.now()}`,
        }
    );
    logger.info(`Completion certificate queued for user ${data.userId}`);
}

/**
 * Register (idempotently) the recurring job that scans for inactive users.
 * Runs once per day; the worker's INACTIVE_SCAN handler does the querying.
 * Cron + timezone are configurable via env (defaults to 10:00 Asia/Kolkata).
 */
export async function scheduleInactiveUserScan() {
    const pattern = process.env.INACTIVE_SCAN_CRON || "0 10 * * *";
    const tz = process.env.INACTIVE_SCAN_TZ || "Asia/Kolkata";
    await getNotificationQueue().upsertJobScheduler(
        "inactive-user-scan",
        { pattern, tz },
        { name: NotificationType.INACTIVE_SCAN, data: {} }
    );
    logger.info(`Inactive-user scan scheduled (cron "${pattern}" ${tz})`);
}

/**
 * Queue a re-engagement reminder for a single inactive user.
 */
export async function queueInactiveReminder(data: InactiveReminderData) {
    await getNotificationQueue().add(
        NotificationType.INACTIVE_USER_REMINDER,
        data,
        {
            // One reminder per user per day at most, even if a scan re-runs.
            jobId: `inactive-${data.userId}-${new Date().toISOString().slice(0, 10)}`,
        }
    );
}

