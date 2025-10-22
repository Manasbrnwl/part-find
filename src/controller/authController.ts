import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import {
  calculateOTPExpiry,
  generateOTP,
  isOTPExpired,
} from "../../utils/otp/functions.otp";
import {
  handleControllerError,
  handleNotFoundError,
  handleValidationError,
  asyncHandler,
} from "../utils/errorHandler";
import { getFirebaseAdmin } from "../../utils/firebase";
const {
  sendEmailNotification,
} = require("../../utils/notification/email.notification");

dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

/**
 * Request OTP for login or signup
 * @param req Request object with email or phone_number
 * @param res Response object
 */
export const requestOTP = asyncHandler(async (req: Request, res: Response) => {
  const { email, phone_number, role } = req.body;

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

  res.status(200).json({
    success: true,
    message: `OTP sent to ${isEmail ? email : phone_number}`,
    data: {
      userId: user?.id,
      profile: user?.userImages,
      isNewUser: !user?.name, // If name is not set, it's likely a new user
    },
  });
});

/**
 * Verify OTP and complete signup/login
 * @param req Request object with userId, otp, and user details for new users
 * @param res Response object
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { userId, otp, name, password } = req.body;

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

  // Generate JWT token
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "24h",
  });

  // Update user data
  const updateData: any = {
    jwt_token: token,
    otp: null, // Clear OTP after successful verification
    otp_exp: null,
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

  res.status(200).json({
    success: true,
    message: isNewUser ? "Signup successful" : "Login successful",
    data: {
      user: userWithoutSensitiveData,
      token,
      isNewUser,
    },
  });
});

/**
 * Complete Third Party Login/Signup
 * @param req Request object with userId, otp, and user details for new users
 * @param res Response object
 */
export const loginGoogleUser = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const { fcmToken, idToken } = req.body;
      if (!idToken || !fcmToken) {
        return res.status(400).json({
          success: false,
          message: "Google ID token and FCM token are required",
        });
      }
      const admin = getFirebaseAdmin();
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const { user_id, email, name } = decodedToken;

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
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        {
          expiresIn: "24h",
        }
      );
      user = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          jwt_token: token,
          fcm_token: fcmToken,
        },
      });
      res.json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone_number || "",
          role: user.role,
          token,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * Logout user - clear jwt_token and fcm_token
 * @param req Request object with userId from auth middleware
 * @param res Response object
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore - userId will be added by auth middleware
  const userId = req.userId;

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

  // Clear JWT token and FCM token
  await prisma.user.update({
    where: { id: userId },
    data: {
      jwt_token: null,
      fcm_token: null,
    },
  });

  res.status(200).json({
    success: true,
    message: "Logout successful",
    data: {},
  });
});

/**
 * Delete user profile - soft delete by setting is_active to false
 * Also deletes related data: images, posts, applications, saved posts, industries, gig types
 * @param req Request object with userId from auth middleware
 * @param res Response object
 */
export const deleteProfile = asyncHandler(
  async (req: Request, res: Response) => {
    // @ts-ignore - userId will be added by auth middleware
    const userId = req.userId;

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

    const postIds = userPosts.map((post) => post.id);

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

    res.status(200).json({
      success: true,
      message: "Profile deleted successfully",
      data: {
        deletedUserId: deletedUser.id,
        email: deletedUser.email,
      },
    });
  }
);
