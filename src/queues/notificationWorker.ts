import { Worker, Job } from "bullmq";
import { redisConnection } from "./config";
import {
    NotificationType,
    JobReminderData,
    RatingNotificationData,
} from "./notificationQueue";
import { sendFCMNotification } from "../../utils/firebase";

let notificationWorker: Worker | null = null;

/**
 * Process job reminder notification
 */
async function processJobReminder(data: JobReminderData) {
    if (!data.fcmToken) {
        console.log(`⚠️ No FCM token for user ${data.userId}, skipping notification`);
        return;
    }

    const startDate = new Date(data.startDate);
    const formattedDate = startDate.toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

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
        
                    default:
                        console.warn(`⚠️ Unknown notification type: ${job.name}`);
                }
            },
            {
                connection: redisConnection,
                concurrency: 2,
                lockDuration: 60000,
                stalledInterval: 60000,
                maxStalledCount: 1,
                drainDelay: 60,
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
    } catch (err: any) {
        console.error("❌ Failed to start notification worker:", err.message);
        return null;
    }
}
