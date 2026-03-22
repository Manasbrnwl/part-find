import { Worker, Job } from "bullmq";
import { redisConnection } from "./config";
import {
    NotificationType,
    JobReminderData,
    RatingNotificationData,
    NewJobPostedData,
    NewApplicationData,
} from "./notificationQueue";
import { sendFCMNotification, sendFCMToMultipleTokens } from "../../utils/firebase";

let notificationWorker: Worker | null = null;

/**
 * Process job reminder notification
 */
async function processJobReminder(data: JobReminderData) {
    if (!data.fcmToken) {
        console.log(`⚠️ No FCM token for user ${data.userId}, skipping notification`);
        return;
    }

    await sendFCMNotification(data.fcmToken, {
        title: "📅 Job Reminder",
        body: `Your job "${data.postTitle}" starts tomorrow at ${data.location}`,
        reminderId: data.postId,
        type: NotificationType.JOB_REMINDER,
    });

    console.log(`✅ Job reminder sent to user ${data.userId}`);
}

/**
 * Process rating received notification
 */
async function processRatingNotification(data: RatingNotificationData) {
    if (!data.fcmToken) {
        console.log(`⚠️ No FCM token for user ${data.userId}, skipping notification`);
        return;
    }

    const stars = "⭐".repeat(data.rating);

    await sendFCMNotification(data.fcmToken, {
        title: "⭐ You received a rating!",
        body: `${data.recruiterName} rated you ${stars} for "${data.postTitle}"`,
        reminderId: data.userId,
        type: NotificationType.RATING_RECEIVED,
    });

    console.log(`✅ Rating notification sent to user ${data.userId}`);
}

/**
 * Process new job posted notification — broadcasts to all users with FCM tokens
 */
async function processNewJobPosted(data: NewJobPostedData) {
    if (!data.fcmTokens.length) {
        console.log(`⚠️ No FCM tokens available, skipping new job notification`);
        return;
    }

    await sendFCMToMultipleTokens(data.fcmTokens, {
        title: "🆕 New Job Posted!",
        body: `"${data.postTitle}" at ${data.companyName || "a company"} in ${data.location || "TBD"}`,
        reminderId: data.postId,
        type: NotificationType.NEW_JOB_POSTED,
    });

    console.log(`✅ New job notification broadcast to ${data.fcmTokens.length} users`);
}

/**
 * Process new application notification — sent to the recruiter
 */
async function processNewApplication(data: NewApplicationData) {
    if (!data.recruiterFcmToken) {
        console.log(`⚠️ No FCM token for recruiter, skipping application notification`);
        return;
    }

    await sendFCMNotification(data.recruiterFcmToken, {
        title: "📋 New Application!",
        body: `${data.applicantName} applied for "${data.postTitle}"`,
        reminderId: data.postId,
        type: NotificationType.NEW_APPLICATION,
    });

    console.log(`✅ Application notification sent to recruiter for post ${data.postId}`);
}

export function startNotificationWorker() {
    if (notificationWorker) return notificationWorker;

    try {
        console.log("🚀 Initializing notification worker...");
        notificationWorker = new Worker(
            "notifications",
            async (job: Job) => {
                console.log(`🔔 Processing notification job: ${job.name} (${job.id})`);
        
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
        
                    default:
                        console.warn(`⚠️ Unknown notification type: ${job.name}`);
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
            console.log(`✅ Job ${job.id} completed successfully`);
        });

        notificationWorker.on("failed", (job, err) => {
            console.error(`❌ Job ${job?.id} failed:`, err.message);
        });

        notificationWorker.on("error", (err) => {
            if (err.message.includes("max requests limit exceeded")) {
                console.warn("⚠️ Worker standby: Redis limit reached.");
            } else {
                console.error("❌ Worker error:", err.message);
            }
        });

        notificationWorker.on("ready", () => {
            console.log("✅ Notification worker is ready and connected");
        });

        return notificationWorker;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("❌ Failed to start notification worker:", errMsg);
        return null;
    }
}
