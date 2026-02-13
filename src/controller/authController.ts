import { Context } from "hono";
import jwt from "jsonwebtoken";
import {
  generateAccessToken,
  createAndSaveRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from "../utils/tokenUtils";
import {
  calculateOTPExpiry,
  generateOTP,
  isOTPExpired,
} from "../../utils/otp/functions.otp";
import {
  handleControllerError,
  handleNotFoundError,
  handleValidationError,
} from "../utils/errorHandler";
import { getFirebaseAdmin } from "../../utils/firebase";
// @ts-ignore
import { sendEmailNotification } from "../../utils/notification/email.notification";
import { getPrisma } from "../lib/prisma";

/**
 * Request OTP for login or signup
 */
export const requestOTP = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const { email, phone_number, role } = await c.req.json();

    if (!email && !phone_number) {
      throw handleValidationError("Email or phone number is required");
    }

    const identifier = email || phone_number;
    const isEmail = !!email;

    // Check if user exists
    let user = await prisma.user.findFirst({
      select: {
        id: true,
        name: true,
        userImages: {
          select: {
            image: true,
          },
        },
      },
      where: {
        is_active: true,
        email: isEmail ? identifier : undefined,
        phone_number: !isEmail ? identifier : undefined,
      },
    });

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = calculateOTPExpiry();

    if (user) {
      // Existing user - update with new OTP
      await prisma.user.update({
        where: { id: user.id },
        data: { otp, otp_exp: otpExpiry },
      });
    } else {
      // New user - create temporary user record
      const newUser = await prisma.user.create({
        data: {
          email: isEmail ? identifier : undefined,
          phone_number: !isEmail ? identifier : undefined,
          otp,
          otp_exp: otpExpiry,
          is_active: true, // Ensure user is active
          role,
        },
        select: {
          id: true,
          name: true,
          userImages: {
            select: {
              image: true,
            },
          },
        },
      });

      user = newUser;
    }

    // Send OTP via email or SMS
    let sent = false;
    if (isEmail) {
      // Send email with OTP
      await sendEmailNotification(
        identifier,
        "Part Find - Authentication OTP",
        `Your OTP for authentication is: ${otp}. It will expire in 3 minutes.`,
        `<h1>Authentication OTP</h1><p>Your OTP for authentication is: <strong>${otp}</strong></p><p>It will expire in 3 minutes.</p>`
      );
      sent = true;
    } else {
      // For SMS implementation (placeholder)
      // Implement SMS sending logic here
      sent = true;
    }

    if (!sent) {
      throw new Error(`Failed to send OTP to ${isEmail ? "email" : "phone"}`);
    }

    return c.json({
      success: true,
      message: `OTP sent to ${isEmail ? email : phone_number}`,
      data: {
        userId: user?.id,
        profile: user?.userImages,
        isNewUser: !user?.name, // If name is not set, it's likely a new user
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

/**
 * Verify OTP and complete signup/login
 */
export const verifyOTP = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const { userId, otp, name, password, fcmToken } = await c.req.json();

    if (!userId || !otp) {
      throw handleValidationError("User ID and OTP are required");
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw handleNotFoundError("User");
    }

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otp_exp) {
      throw handleValidationError("No OTP was generated for this user");
    }

    if (isOTPExpired(user.otp_exp)) {
      throw handleValidationError("OTP has expired");
    }

    // Verify OTP
    if (user.otp !== otp.toString()) {
      throw handleValidationError("Invalid OTP");
    }

    // Determine if this is a new user (no password set)
    const isNewUser = !user.name;

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email, c.env?.JWT_SECRET);
    const refreshToken = await createAndSaveRefreshToken(prisma, user.id);

    // Update user data
    const updateData: any = {
      otp: null, // Clear OTP after successful verification
      otp_exp: null,
      ...(fcmToken && { fcm_token: fcmToken }),
    };

    // Update user
    const updatedUser = await prisma.user.update({
      include: {
        userImages: {
          select: {
            image: true,
          },
        },
      },
      where: { id: user.id },
      data: updateData,
    });

    // Return success response without sensitive data
    const {
      otp: __,
      otp_exp: ___,
      jwt_token,
      createdAt,
      updatedAt,
      ...userWithoutSensitiveData
    } = updatedUser;

    return c.json({
      success: true,
      message: isNewUser ? "Signup successful" : "Login successful",
      data: {
        user: userWithoutSensitiveData,
        accessToken,
        refreshToken,
        isNewUser,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

/**
 * Complete Third Party Login/Signup
 */
export const loginGoogleUser = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const { fcmToken, idToken } = await c.req.json();

    if (!idToken || !fcmToken) {
      return c.json({
        success: false,
        message: "Google ID token and FCM token are required",
      }, 400);
    }

    // Note: clean this up for edge if firebase-admin is not edge compatible
    const admin = getFirebaseAdmin();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { user_id, email, name } = decodedToken;

    if (!email) {
      return c.json({
        success: false,
        message: "Google account does not have an associated email",
      }, 400);
    }

    let user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: user_id,
          name,
          email,
        },
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email, c.env?.JWT_SECRET);
    const refreshToken = await createAndSaveRefreshToken(prisma, user.id);

    // Update FCM token
    user = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        fcm_token: fcmToken,
      },
    });

    return c.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone_number || "",
        role: user.role,
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
    return handleControllerError(error, c);
  }
};

/**
 * Logout user - revoke refresh token and clear fcm_token
 */
export const logout = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const { refreshToken } = await c.req.json();

    if (!userId) {
      throw handleValidationError("User ID is required");
    }

    // Revoke the refresh token if provided
    if (refreshToken) {
      await revokeRefreshToken(prisma, refreshToken);
    }

    // Clear FCM token
    await prisma.user.update({
      where: { id: userId },
      data: {
        fcm_token: null,
      },
    });

    return c.json({
      success: true,
      message: "Logout successful",
      data: {},
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

/**
 * Refresh tokens - generate new access and refresh tokens
 */
export const refreshTokens = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const { refreshToken } = await c.req.json();

    if (!refreshToken) {
      throw handleValidationError("Refresh token is required");
    }

    // Validate the refresh token
    const result = await validateRefreshToken(prisma, refreshToken);

    if (!result.valid || !result.user) {
      return c.json({
        success: false,
        message: result.error || "Invalid refresh token",
      }, 401);
    }

    // Revoke the old refresh token (rotation)
    await revokeRefreshToken(prisma, refreshToken);

    // Generate new tokens
    const newAccessToken = generateAccessToken(result.user.id, result.user.email, c.env?.JWT_SECRET);
    const newRefreshToken = await createAndSaveRefreshToken(prisma, result.user.id);

    return c.json({
      success: true,
      message: "Tokens refreshed successfully",
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

/**
 * Logout from all devices - revoke all refresh tokens
 */
export const logoutAll = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

    if (!userId) {
      throw handleValidationError("User ID is required");
    }

    // Revoke all refresh tokens for this user
    const revokedCount = await revokeAllUserTokens(prisma, userId);

    // Clear FCM token
    await prisma.user.update({
      where: { id: userId },
      data: {
        fcm_token: null,
      },
    });

    return c.json({
      success: true,
      message: `Logged out from all devices. ${revokedCount} session(s) revoked.`,
      data: { revokedSessions: revokedCount },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

/**
 * Delete user profile
 */
export const deleteProfile = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

    if (!userId) {
      throw new Error("User ID is required");
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw handleNotFoundError("User");
    }

    // Delete all related data
    // Delete user images
    await prisma.images.deleteMany({
      where: { userId },
    });

    // Delete user posts and their applications
    const userPosts = await prisma.post.findMany({
      where: { userId },
      select: { id: true },
    });

    const postIds = userPosts.map((post: { id: string }) => post.id);

    // Delete applications for user's posts
    if (postIds.length > 0) {
      await prisma.postApplied.deleteMany({
        where: { postId: { in: postIds } },
      });

      // Delete post categories for user's posts
      await prisma.postCategory.deleteMany({
        where: { post_id: { in: postIds } },
      });

      // Delete saved posts related to user's posts
      await prisma.savePosts.deleteMany({
        where: { postId: { in: postIds } },
      });
    }

    // Delete user posts
    await prisma.post.deleteMany({
      where: { userId },
    });

    // Delete user applications to other posts
    await prisma.postApplied.deleteMany({
      where: { userId },
    });

    // Delete user saved posts
    await prisma.savePosts.deleteMany({
      where: { userId },
    });

    // Delete user categories
    await prisma.userCategory.deleteMany({
      where: { user_id: userId },
    });

    // Delete recruiter industries
    await prisma.recruiterIndustry.deleteMany({
      where: { user_id: userId },
    });

    // Delete recruiter gig types
    await prisma.recruiterGigType.deleteMany({
      where: { user_id: userId },
    });

    // Soft delete user - set is_active to false
    const deletedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        is_active: false,
        jwt_token: null,
        fcm_token: null,
      },
    });

    return c.json({
      success: true,
      message: "Profile deleted successfully",
      data: {
        deletedUserId: deletedUser.id,
        email: deletedUser.email,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};
