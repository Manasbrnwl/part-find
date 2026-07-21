import * as admin from "firebase-admin";
import dotenv from "dotenv";
import { logger } from "./logger";

dotenv.config({ override: true });

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
    let rawKey = process.env.FIREBASE_PRIVATE_KEY;

    // Check if rawKey is missing or truncated, and we have a base64 fallback
    if ((!rawKey || rawKey.length < 500) && process.env.FIREBASE_PRIVATE_KEY_BASE64) {
      try {
        rawKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, "base64").toString("utf8").trim();
      } catch (e) {
        // ignore
      }
    }

    let formattedKey = rawKey?.trim();
    if (formattedKey) {
      if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
        formattedKey = formattedKey.slice(1, -1).trim();
      }
      if (formattedKey.startsWith("'") && formattedKey.endsWith("'")) {
        formattedKey = formattedKey.slice(1, -1).trim();
      }
      // If the key is not in PEM format, check if it's base64 encoded
      if (!formattedKey.startsWith("-----BEGIN")) {
        try {
          const decoded = Buffer.from(formattedKey, "base64").toString("utf8").trim();
          if (decoded.startsWith("-----BEGIN")) {
            formattedKey = decoded;
          }
        } catch (e) {
          // ignore
        }
      }
      formattedKey = formattedKey.replace(/\\n/g, "\n");
    }
    
    logger.info("Firebase initialization parameters", {
      projectId: process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      rawKeyLength: rawKey?.length,
      formattedKeyLength: formattedKey?.length,
      formattedKeyLooksLikePem: Boolean(formattedKey?.startsWith("-----BEGIN")),
    });

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey,
      }),
    });

    logger.info("Firebase Admin SDK initialized successfully");
    return admin;
  } catch (error) {
    logger.error("Failed to initialize Firebase Admin SDK", { error });
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
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!fcmToken) {
      logger.warn("sendFCMNotification called without FCM token");
      return { success: false, error: "FCM token is empty" };
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
    logger.info(`FCM notification sent successfully. Message ID: ${response}`);
    return { success: true };
  } catch (error: any) {
    logger.error("Failed to send FCM notification", { error: error.message || error });

    // Handle specific FCM errors
    let errorMsg = error.message || String(error);
    if (error.code === "messaging/registration-token-not-registered") {
      logger.warn("FCM token is no longer valid. User should re-register.");
      errorMsg = "Token not registered / expired";
    } else if (error.code === "messaging/invalid-registration-token") {
      logger.warn("Invalid FCM token format.");
      errorMsg = "Invalid token format";
    }

    return { success: false, error: errorMsg };
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
    logger.warn("sendFCMToMultipleTokens called with empty token list");
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

      logger.info(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${response.successCount} sent, ${response.failureCount} failed`
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Batch multicast failed", { error: errMsg });
      totalFailure += batch.length;
    }
  }

  logger.info(`Multicast complete: ${totalSuccess} success, ${totalFailure} failed`);
  return { successCount: totalSuccess, failureCount: totalFailure };
};

export { getFirebaseAdmin, sendFCMNotification, sendFCMToMultipleTokens, FCMNotificationPayload };
