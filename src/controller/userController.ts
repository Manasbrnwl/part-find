import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import {
  handleControllerError,
  handleNotFoundError,
  handleValidationError,
  handleAuthorizationError,
  asyncHandler,
} from "../utils/errorHandler";

dotenv.config();

const prisma = new PrismaClient();

// Get current user profile
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore - userId will be added by auth middleware
  const userId = req.userId;

  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userImages: {
        select: {
          id: true,
          image: true,
        },
      },
      UserCategory: {
        select: {
          JobCategory: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  // Return user data without password, createdAt, and updatedAt
  const {
    createdAt,
    updatedAt,
    jwt_token,
    otp,
    otp_exp,
    fcm_token,
    ...userWithoutPassword
  } = user;

  res.status(200).json({
    success: true,
    message: "Profile fetched successfully",
    data: {
      user: userWithoutPassword,
      baseUrl: `${req.protocol}://${req.hostname}/images/`,
    },
  });
});

export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    // @ts-ignore - userId will be added by auth middleware
    const userId = req.userId;

    if (!userId) {
      throw handleAuthorizationError("User ID is required");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw handleNotFoundError("User");
    }

    const {
      name,
      phone_number,
      date_of_birth,
      address,
      height,
      weight,
      state,
      gender,
      english_level,
      country,
      imageId,
    } = req.body;

    // Update user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone_number,
        date_of_birth: date_of_birth
          ? new Date(date_of_birth)
          : user.date_of_birth,
        address: address || user.address,
        height: parseFloat(height) || user.height,
        weight: parseFloat(weight) || user.weight,
        state: state || user.state,
        gender: gender || user.gender,
        country: country || user.country,
        english_level: english_level || user.english_level,
      },
    });

    if (imageId) {
      await prisma.images.deleteMany({
        where: {
          id: {
            in: imageId.split(","),
          },
        },
      });
    }

    const files = req.files as { profile_image?: Express.Multer.File[] };
    const profile_image = files.profile_image;

    if (profile_image) {
      await prisma.images.createMany({
        data: profile_image?.map((file: any) => ({
          userId,
          image: file.filename,
        })),
        skipDuplicates: true,
      });
    }

    if (req.body.categories) {
      await prisma.userCategory.deleteMany({
        where: {
          user_id: userId,
        },
      });
    }

    if (req.body.categories) {
      let categories = req.body.categories.split(",");
      await prisma.userCategory.createMany({
        data: categories?.map((id: string) => ({
          user_id: userId,
          category_id: parseInt(id),
        })),
      });
    }

    // Return updated user data without password, createdAt, and updatedAt
    const {
      createdAt,
      updatedAt,
      fcm_token,
      jwt_token,
      otp,
      otp_exp,
      ...userWithoutPassword
    } = updatedUser;

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: userWithoutPassword,
      },
    });
  }
);

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: {
      is_active: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone_number: true,
      address: true,
      createdAt: true,
      updatedAt: true,
      userImages: {
        select: {
          id: true,
          image: true,
        },
      },
      // Exclude sensitive fields like password
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.status(200).json({
    success: true,
    message: "Users fetched successfully",
    data: {
      users,
      baseUrl: `${req.protocol}://${req.host}/images/`,
    },
  });
});
