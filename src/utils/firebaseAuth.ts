import { createRemoteJWKSet, jwtVerify } from 'jose';

// Firebase's public JWKS endpoint for secure token verification
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Cache the JWK set fetching automatically
const JWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

/**
 * Verifies a Firebase/Google ID token natively on Cloudflare Workers.
 * 
 * @param idToken The JWT token received from the client
 * @param projectId The Firebase Project ID
 * @returns The decoded payload if valid, otherwise null
 */
export async function verifyFirebaseToken(idToken: string, projectId: string) {
    try {
        const { payload } = await jwtVerify(idToken, JWKS, {
            issuer: `https://securetoken.google.com/${projectId}`,
            audience: projectId,
        });
        return payload;
    } catch (err) {
        console.error("Firebase token verification failed:", err);
        return null;
    }
}
