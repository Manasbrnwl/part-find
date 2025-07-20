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
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return user data without password, createdAt, and updatedAt
    const { password, createdAt, updatedAt, ...userWithoutPassword } = user;

    return res.status(200).json({
      message: "Profile fetched successfully",
      user: {
        ...userWithoutPassword,
        profile_image: `${req.protocol}://${req.get("host")}/images/${
          userWithoutPassword.profile_image
        }`
      }
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
      address,
      height,
      weight,
      city,
      state,
      zip_code,
      gender,
      country
    } = req.body;

    // Update user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone_number,
        address: address || user.address,
        hieght: height || user.hieght,
        weight: weight || user.weight,
        city: city || user.city,
        state: state || user.state,
        zip_code: zip_code || user.zip_code,
        gender: gender || user.gender,
        country: country || user.country,
        profile_image: (req as any).file?.filename || user.profile_image
      }
    });

    // Return updated user data without password, createdAt, and updatedAt
    const { password, createdAt, updatedAt, ...userWithoutPassword } =
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
        updatedAt: true
        // Exclude sensitive fields like password
      }
    });

    return res.status(200).json({
      message: "Users fetched successfully",
      data: users
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
