/**
 * Firebase Web SDK Configuration
 * 
 * This file provides the client-side Firebase configuration for:
 * - FCM token generation (getToken)
 * - Firebase Authentication (Google Sign-In)
 * - Analytics
 * 
 * Note: For server-side FCM message sending, use firebase.ts (Firebase Admin SDK)
 */

import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyAJESuXHhwcK5F5hi5T5kJcOWHBMkiVHzw",
    authDomain: "partfind-fb054.firebaseapp.com",
    projectId: "partfind-fb054",
    storageBucket: "partfind-fb054.firebasestorage.app",
    messagingSenderId: "487609923638",
    appId: "1:487609923638:web:d2f09e975b2a34f380c097",
    measurementId: "G-EX9WP4LQGG",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

/**
 * Get Firebase Cloud Messaging instance
 * Note: This only works in browser environments
 */
const messaging = typeof window !== "undefined" ? getMessaging(app) : null;

/**
 * Get the FCM registration token for this device
 * @param vapidKey - VAPID key from Firebase Console > Project Settings > Cloud Messaging
 * @returns FCM token string
 */
const getFCMToken = async (vapidKey: string): Promise<string | null> => {
    try {
        if (!messaging) {
            console.warn("Firebase Messaging is not available in this environment");
            return null;
        }

        const token = await getToken(messaging, { vapidKey });
        console.log("📱 FCM Token:", token);
        return token;
    } catch (error) {
        console.error("❌ Failed to get FCM token:", error);
        return null;
    }
};

/**
 * Listen for foreground messages
 * @param callback - Function to handle incoming messages
 */
const onForegroundMessage = (callback: (payload: any) => void) => {
    if (!messaging) {
        console.warn("Firebase Messaging is not available in this environment");
        return;
    }

    onMessage(messaging, (payload) => {
        console.log("📩 Foreground message received:", payload);
        callback(payload);
    });
};

export { app, messaging, getFCMToken, onForegroundMessage };
