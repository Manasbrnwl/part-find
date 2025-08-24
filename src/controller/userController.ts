import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// Get current user profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - userId will be added by auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userImages: {
          select: {
            id: true,
            image: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return user data without password, createdAt, and updatedAt
    const { createdAt, updatedAt, jwt_token, otp, otp_exp, fcm_token, ...userWithoutPassword } = user;

    return res.status(200).json({
      message: "Profile fetched successfully",
      user: {
        ...userWithoutPassword,
      },
      baseUrl: `${req.protocol}://${req.hostname}/images/`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - userId will be added by auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
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
      imageId
    } = req.body;

    // Update user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone_number,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : user.date_of_birth,
        address: address || user.address,
        height: parseFloat(height) || user.height,
        weight: parseFloat(weight) || user.weight,
        state: state || user.state,
        gender: gender || user.gender,
        country: country || user.country,
        english_level: english_level || user.english_level,
      }
    });

    if (imageId) {
      const deleteImages = await prisma.images.deleteMany({
        where: {
          id: {
            in: imageId.split(',')
          }
        }
      })
    }
    const files = req.files as { profile_image?: Express.Multer.File[] };
    const profile_image = files.profile_image
    if (profile_image) {
      const addImage = await prisma.images.createMany({
        data: profile_image?.map((file: any) => ({
          userId,
          image: file.filename
        })),
        skipDuplicates: true
      })
    }

    // Return updated user data without password, createdAt, and updatedAt
    const { createdAt, updatedAt, fcm_token, jwt_token, otp, otp_exp, ...userWithoutPassword } =
      updatedUser;

    return res.status(200).json({
      message: "Profile updated successfully",
      user: userWithoutPassword
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
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
            image: true
          }
        }
        // Exclude sensitive fields like password
      }
    });

    return res.status(200).json({
      message: "Users fetched successfully",
      data: users,
      baseUrl: `${req.protocol}://${req.host}/images/`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
