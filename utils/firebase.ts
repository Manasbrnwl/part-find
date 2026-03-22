import * as admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// Notification payload interface
interface FCMNotificationPayload {
  title: string;
  body: string;
  reminderId: string;
  type: string;
  [key: string]: string;
}

// Initialize Firebase Admin SDK
const initializeFirebase = (): typeof admin => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length) {
      return admin;
    }

    // Initialize the app with service account credentials
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

    console.log("✅ Firebase Admin SDK initialized successfully");
    return admin;
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error);
    throw error;
  }
};

// Get Firebase Admin instance (singleton)
const getFirebaseAdmin = (() => {
  let firebaseAdmin: typeof admin | null = null;
  return (): typeof admin => {
    if (!firebaseAdmin) {
      firebaseAdmin = initializeFirebase();
    }
    return firebaseAdmin;
  };
})();

/**
 * Send FCM notification to a specific user
 * @param fcmToken - User's FCM registration token
 * @param notification - Notification payload with title, body, type, etc.
 * @returns Success status
 */
const sendFCMNotification = async (
  fcmToken: string,
  notification: FCMNotificationPayload
): Promise<boolean> => {
  try {
    if (!fcmToken) {
      console.warn("⚠️ sendFCMNotification called without FCM token");
      return false;
    }

    const firebaseAdmin = getFirebaseAdmin();

    const message: admin.messaging.Message = {
      token: fcmToken,
      // Data payload - always delivered, even in background
      data: {
        title: notification.title,
        body: notification.body,
        reminderId: notification.reminderId.toString(),
        type: notification.type,
      },
      // Notification payload - shown in system tray
      notification: {
        title: notification.title,
        body: notification.body,
      },
      // Android-specific configuration
      android: {
        priority: "high",
        notification: {
          channelId: "part-find-notifications",
          priority: "high",
          defaultSound: true,
        },
      },
      // APNs configuration for iOS
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await firebaseAdmin.messaging().send(message);
    console.log(`✅ FCM notification sent successfully. Message ID: ${response}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send FCM notification:`, error.message || error);

    // Handle specific FCM errors
    if (error.code === "messaging/registration-token-not-registered") {
      console.warn("⚠️ FCM token is no longer valid. User should re-register.");
    } else if (error.code === "messaging/invalid-registration-token") {
      console.warn("⚠️ Invalid FCM token format.");
    }

    return false;
  }
};

/**
 * Send FCM notification to multiple tokens (broadcast)
 * Batches tokens in groups of 500 (FCM limit per multicast call)
 */
const sendFCMToMultipleTokens = async (
  fcmTokens: string[],
  notification: FCMNotificationPayload
): Promise<{ successCount: number; failureCount: number }> => {
  if (!fcmTokens.length) {
    console.warn("⚠️ sendFCMToMultipleTokens called with empty token list");
    return { successCount: 0, failureCount: 0 };
  }

  const firebaseAdmin = getFirebaseAdmin();
  let totalSuccess = 0;
  let totalFailure = 0;

  // FCM allows max 500 tokens per multicast call
  const BATCH_SIZE = 500;
  for (let i = 0; i < fcmTokens.length; i += BATCH_SIZE) {
    const batch = fcmTokens.slice(i, i + BATCH_SIZE);

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: batch,
        data: {
          title: notification.title,
          body: notification.body,
          reminderId: notification.reminderId.toString(),
          type: notification.type,
        },
        notification: {
          title: notification.title,
          body: notification.body,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "part-find-notifications",
            priority: "high",
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      console.log(
        `📤 Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${response.successCount} sent, ${response.failureCount} failed`
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Batch multicast failed:`, errMsg);
      totalFailure += batch.length;
    }
  }

  console.log(`📊 Multicast complete: ${totalSuccess} success, ${totalFailure} failed`);
  return { successCount: totalSuccess, failureCount: totalFailure };
};

export { getFirebaseAdmin, sendFCMNotification, sendFCMToMultipleTokens, FCMNotificationPayload };
