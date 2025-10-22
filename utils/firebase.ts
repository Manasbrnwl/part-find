const admin = require("firebase-admin");
require("dotenv").config();

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
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

    return admin;
  } catch (error) {
    throw error;
  }
};

// Get Firebase Admin instance
const getFirebaseAdmin = (() => {
  let firebaseAdmin: any = null;
  return () => {
    if (!firebaseAdmin) {
      firebaseAdmin = initializeFirebase();
    }
    return firebaseAdmin;
  };
})();

/**
 * Send FCM notification to a specific user
 * @param {string} fcmToken - User's FCM token
 * @param {object} notification - Notification data
 * @returns {Promise<boolean>} - Success status
 */
const sendFCMNotification = async (fcmToken: string, notification: any) => {
  try {
    if (!fcmToken) {
      return false;
    }

    const admin = getFirebaseAdmin();

    const message = {
      token: fcmToken,
      data: {
        title: notification.title,
        body: notification.body,
        reminderId: notification.reminderId.toString(),
        type: notification.type,
      },
    };

    const response = await admin.messaging().send(message);
    return true;
  } catch (error) {
    return false;
  }
};

export {
  getFirebaseAdmin,
  sendFCMNotification,
};
