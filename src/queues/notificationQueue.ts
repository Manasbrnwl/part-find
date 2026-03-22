import { Queue } from "bullmq";
import { redisConnection } from "./config";

export enum NotificationType {
    JOB_REMINDER = "JOB_REMINDER",
    RATING_RECEIVED = "RATING_RECEIVED",
    NEW_JOB_POSTED = "NEW_JOB_POSTED",
    NEW_APPLICATION = "NEW_APPLICATION",
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
            console.error("❌ Notification queue error:", err);
        });

        console.log("📨 Notification queue initialized");
    }
    return _notificationQueue;
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
        console.log(`📅 Job reminder scheduled for ${reminderDate.toISOString()}`);
        return true;
    } else {
        console.log(`⚠️ Job starts too soon, no reminder scheduled`);
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
    console.log(`⭐ Rating notification queued for user ${data.userId}`);
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
    console.log(`📢 New job notification queued for ${data.fcmTokens.length} users`);
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
    console.log(`📋 Application notification queued for recruiter`);
}

