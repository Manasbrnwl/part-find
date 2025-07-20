import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// User registration
export const signup = async (req: Request, res: Response) => {
  try {
    const { email, name, password, phone_number } = req.body;

    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        phone_number
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Update user with JWT token
    await prisma.user.update({
      where: { id: newUser.id },
      data: { jwt_token: token }
    });

    // Return success response without password
    const { password: _, ...userWithoutPassword } = newUser;
    //Return success response without createdAt and updatedAt and password
    const { createdAt, updatedAt, ...userWithoutTimestamps } =
      userWithoutPassword;

    return res.status(201).json({
      message: "User registered successfully",
      user: userWithoutTimestamps,
      token
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// User login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please fill the required fields" });
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone_number: email }]
      }
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "24h"
    });

    // Update user with JWT token
    await prisma.user.update({
      where: { id: user.id },
      data: { jwt_token: token }
    });

    // Return success response without password
    const { password: _, ...userWithoutPassword } = user;
    // Return success response without createdAt, updatedAt and jwt_token
    const { createdAt, updatedAt, jwt_token, ...userWithoutTimestamps } =
      userWithoutPassword;

    return res.status(200).json({
      message: "Login successful",
      user: userWithoutTimestamps,
      token
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
