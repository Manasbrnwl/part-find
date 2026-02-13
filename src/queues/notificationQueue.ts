// Notification types
export enum NotificationType {
    JOB_REMINDER = "JOB_REMINDER",
    RATING_RECEIVED = "RATING_RECEIVED",
}

// Job data interfaces
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

/**
 * Schedule a job reminder notification for 1 day before the job starts
 */
export async function scheduleJobReminder(data: JobReminderData) {
    const startDate = new Date(data.startDate);
    const reminderDate = new Date(startDate);
    reminderDate.setDate(reminderDate.getDate() - 1); // 1 day before
    reminderDate.setHours(9, 0, 0, 0); // Set to 9 AM

    const delay = reminderDate.getTime() - Date.now();

    // Only schedule if reminder time is in the future
    if (delay > 0) {
        // TODO: Implement Cloudflare Queues or Scheduled Task
        console.log(`[Worker Mock] 📅 Job reminder scheduled for ${reminderDate.toISOString()}`);
        return true;
    } else {
        console.log(`[Worker Mock] ⚠️ Job starts too soon, no reminder scheduled`);
        return false;
    }
}

/**
 * Queue an immediate rating notification
 */
export async function queueRatingNotification(data: RatingNotificationData) {
    // TODO: Implement Cloudflare Queues or Scheduled Task
    console.log(`[Worker Mock] ⭐ Rating notification queued for user ${data.userId}`);
}
