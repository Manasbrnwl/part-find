import { SignJWT, importPKCS8 } from 'jose';

/**
 * Generates an OAuth2 access token for Firebase Cloud Messaging
 * Using the Service Account private key
 */
export async function getAccessToken(clientEmail: string, privateKey: string): Promise<string | null> {
    try {
        const scope = "https://www.googleapis.com/auth/firebase.messaging";

        // Ensure newlines are correctly parsed (handling escaped newlines in env vars)
        const formattedKey = privateKey.replace(/\\n/g, '\n');

        const privateKeyObj = await importPKCS8(formattedKey, 'RS256');

        const iat = Math.floor(Date.now() / 1000);
        const exp = iat + 3600; // 1 hour valid

        const jwt = await new SignJWT({
            iss: clientEmail,
            scope: scope,
            aud: "https://oauth2.googleapis.com/token",
            exp: exp,
            iat: iat
        })
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            .sign(privateKeyObj);

        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: jwt
            })
        });

        if (!response.ok) {
            console.error("Failed to get Google OAuth token:", await response.text());
            return null;
        }

        const data: any = await response.json();
        return data.access_token;
    } catch (error: any) {
        console.error("Error generating OAuth token:", error.message);
        return null;
    }
}

/**
 * Sends a Push Notification via the FCM HTTP v1 REST API
 */
export async function sendFCMNotification(
    env: any,
    fcmToken: string,
    title: string,
    body: string,
    dataParams?: any
) {
    const projectId = env.FIREBASE_PROJECT_ID;
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
        console.warn("[FCM WARNING] Missing Firebase service account credentials in env.");
        return false;
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);
    if (!accessToken) return false;

    const message = {
        message: {
            token: fcmToken,
            notification: {
                title,
                body
            },
            data: dataParams || {}
        }
    };

    try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(message)
        });

        if (!response.ok) {
            console.error("[FCM Error] Send failed:", await response.text());
            return false;
        }

        return true;
    } catch (error: any) {
        console.error(`[FCM Exception] Failed to send push notification:`, error.message);
        return false;
    }
}
