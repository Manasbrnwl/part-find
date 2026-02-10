import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "refresh-secret-key";

// Token expiry configurations
const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

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
            data: { isRevoked: true },
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
        data: { isRevoked: true },
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
