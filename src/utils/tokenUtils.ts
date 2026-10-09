import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

// Token expiry configurations.
// The app refreshes transparently on any 401, so a short access token costs
// users nothing; the long refresh window is what keeps them signed in.
// 5 minutes meant the app refreshed ~12x an hour, and every refresh is a
// chance for the rotation race that logs people out (see refreshTokens).
const ACCESS_TOKEN_EXPIRY = (process.env.ACCESS_TOKEN_EXPIRY ||
    "60m") as jwt.SignOptions["expiresIn"];
const REFRESH_TOKEN_EXPIRY_DAYS = 90; // ~3 months

/**
 * Generate a JWT access token
 */
export const generateAccessToken = (userId: string, email: string): string => {
    return jwt.sign({ userId, email }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });
};

/**
 * Generate a secure random refresh token
 */
export const generateRefreshToken = (): string => {
    return crypto.randomBytes(64).toString("hex");
};

/**
 * Calculate refresh token expiry date
 */
export const getRefreshTokenExpiry = (): Date => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    return expiry;
};

/**
 * Save refresh token to database
 */
export const saveRefreshToken = async (
    userId: string,
    token: string,
    deviceInfo?: string
): Promise<void> => {
    await prisma.refreshToken.create({
        data: {
            userId,
            token,
            deviceInfo,
            expiresAt: getRefreshTokenExpiry(),
        },
    });
};

/**
 * Create and save a new refresh token, returning the token string
 */
export const createAndSaveRefreshToken = async (
    userId: string,
    deviceInfo?: string
): Promise<string> => {
    const token = generateRefreshToken();
    await saveRefreshToken(userId, token, deviceInfo);
    return token;
};

/**
 * How long a just-rotated refresh token keeps working.
 *
 * The app fires several requests at once; when the access token expires they
 * all 401 and each one refreshes independently. The first rotates the token,
 * the rest arrive holding the token that was just revoked. Without this window
 * they get a 401 and the app signs the user out. Inside the window they are
 * handed the replacement instead, so a refresh stampede is harmless.
 */
export const REFRESH_ROTATION_GRACE_MS =
    Math.max(0, parseInt(process.env.REFRESH_ROTATION_GRACE_SECONDS || "60", 10)) * 1000;

/**
 * Rotate a refresh token: claim it atomically, then issue the replacement and
 * link the two.
 *
 * Returns null when another request already claimed this token — the caller
 * then waits for that winner's replacement rather than minting a second one,
 * so a burst of parallel refreshes yields exactly one new token.
 */
export const rotateRefreshToken = async (
    oldToken: string,
    userId: string,
    deviceInfo?: string
): Promise<string | null> => {
    const claim = await prisma.refreshToken.updateMany({
        where: { token: oldToken, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
    });
    if (claim.count === 0) return null; // lost the race

    const newToken = generateRefreshToken();
    await prisma.refreshToken.create({
        data: { userId, token: newToken, deviceInfo, expiresAt: getRefreshTokenExpiry() },
    });
    await prisma.refreshToken.update({
        where: { token: oldToken },
        data: { replacedBy: newToken },
    });
    return newToken;
};

/**
 * The replacement issued for a token that was just rotated, if it is still
 * inside the grace window. Retries briefly: the winner sets replacedBy a
 * moment after claiming the old token.
 */
export const awaitRotationReplacement = async (oldToken: string): Promise<string | null> => {
    for (let attempt = 0; attempt < 6; attempt++) {
        const row = await prisma.refreshToken.findUnique({
            where: { token: oldToken },
            select: { replacedBy: true, revokedAt: true },
        });
        if (!row?.revokedAt || Date.now() - row.revokedAt.getTime() > REFRESH_ROTATION_GRACE_MS) {
            return null;
        }
        if (row.replacedBy) return row.replacedBy;
        await new Promise((r) => setTimeout(r, 100));
    }
    return null;
};

/**
 * Validate a refresh token and return the associated user
 */
export const validateRefreshToken = async (token: string) => {
    const refreshToken = await prisma.refreshToken.findUnique({
        where: { token },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    is_active: true,
                },
            },
        },
    });

    if (!refreshToken) {
        return { valid: false, error: "Invalid refresh token" };
    }

    if (refreshToken.isRevoked) {
        return { valid: false, error: "Refresh token has been revoked" };
    }

    if (refreshToken.expiresAt < new Date()) {
        return { valid: false, error: "Refresh token has expired" };
    }

    if (!refreshToken.user.is_active) {
        return { valid: false, error: "User account is inactive" };
    }

    return { valid: true, user: refreshToken.user, tokenRecord: refreshToken };
};

/**
 * Revoke a specific refresh token
 */
export const revokeRefreshToken = async (token: string): Promise<boolean> => {
    try {
        await prisma.refreshToken.update({
            where: { token },
            // no replacedBy: an explicit logout must not be revivable by the
            // rotation grace window
            data: { isRevoked: true, revokedAt: new Date() },
        });
        return true;
    } catch {
        return false;
    }
};

/**
 * Revoke all refresh tokens for a user
 */
export const revokeAllUserTokens = async (userId: string): Promise<number> => {
    const result = await prisma.refreshToken.updateMany({
        where: {
            userId,
            isRevoked: false,
        },
        data: { isRevoked: true, revokedAt: new Date() },
    });
    return result.count;
};

/**
 * Clean up expired tokens (can be run periodically)
 */
export const cleanupExpiredTokens = async (): Promise<number> => {
    const result = await prisma.refreshToken.deleteMany({
        where: {
            OR: [
                { expiresAt: { lt: new Date() } },
                { isRevoked: true },
            ],
        },
    });
    return result.count;
};
