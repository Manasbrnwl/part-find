import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { calculateOTPExpiry, generateOTP, isOTPExpired } from "../../utils/otp/functions.otp";
const { sendEmailNotification } = require("../../utils/notification/email.notification");

dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// User registration
// export const signup = async (req: Request, res: Response) => {
//   try {
//     const { email, name, password, phone_number } = req.body;

//     // Validate input
//     if (!email || !password) {
//       return res
//         .status(400)
//         .json({ message: "Email and password are required" });
//     }

//     // Check if user already exists
//     const existingUser = await prisma.user.findUnique({
//       where: { email }
//     });

//     if (existingUser) {
//       return res.status(409).json({ message: "User already exists" });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create new user
//     const newUser = await prisma.user.create({
//       data: {
//         email,
//         name,
//         password: hashedPassword,
//         phone_number
//       }
//     });

//     // Generate JWT token
//     const token = jwt.sign(
//       { userId: newUser.id, email: newUser.email },
//       JWT_SECRET,
//       { expiresIn: "24h" }
//     );

//     // Update user with JWT token
//     await prisma.user.update({
//       where: { id: newUser.id },
//       data: { jwt_token: token }
//     });

//     // Return success response without password
//     const { password: _, ...userWithoutPassword } = newUser;
//     //Return success response without createdAt and updatedAt and password
//     const { createdAt, updatedAt, ...userWithoutTimestamps } =
//       userWithoutPassword;

//     return res.status(201).json({
//       message: "User registered successfully",
//       user: userWithoutTimestamps,
//       token
//     });
//   } catch (error: any) {
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: process.env.NODE_ENV === "development" ? error.message : undefined
//     });
//   }
// };

// User login
// export const login = async (req: Request, res: Response) => {
//   try {
//     const { email, password } = req.body;

//     // Validate input
//     if (!email || !password) {
//       return res
//         .status(400)
//         .json({ message: "Please fill the required fields" });
//     }

//     // Find user by email
//     const user = await prisma.user.findFirst({
//       where: {
//         OR: [{ email }, { phone_number: email }]
//       }
//     });

//     if (!user) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }
//     // Compare passwords
//     const isPasswordValid = await bcrypt.compare(password, user.password);

//     if (!isPasswordValid) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     // Generate JWT token
//     const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
//       expiresIn: "24h"
//     });

//     // Update user with JWT token
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { jwt_token: token }
//     });

//     // Return success response without password
//     const { password: _, ...userWithoutPassword } = user;
//     // Return success response without createdAt, updatedAt and jwt_token
//     const { createdAt, updatedAt, jwt_token, ...userWithoutTimestamps } =
//       userWithoutPassword;

//     return res.status(200).json({
//       message: "Login successful",
//       user: userWithoutTimestamps,
//       token
//     });
//   } catch (error: any) {
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: process.env.NODE_ENV === "development" ? error.message : undefined
//     });
//   }
// };

/**
 * Request OTP for login or signup
 * @param req Request object with email or phone_number
 * @param res Response object
 */
export const requestOTP = async (req: Request, res: Response) => {
  try {
    const { email, phone_number } = req.body;

    if (!email && !phone_number) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required"
      });
    }

    const identifier = email || phone_number;
    const isEmail = !!email;

    // Check if user exists
    let user = await prisma.user.findFirst({
      where: {
        is_active: true,
        email: isEmail ? identifier : undefined,
        phone_number: !isEmail ? identifier : undefined
      }
    });

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = calculateOTPExpiry();

    if (user) {
      // Existing user - update with new OTP
      await prisma.user.update({
        where: { id: user.id },
        data: { otp, otp_exp: otpExpiry }
      });
    } else {
      // New user - create temporary user record
      user = await prisma.user.create({
        data: {
          email: isEmail ? identifier : undefined,
          phone_number: !isEmail ? identifier : undefined,
          password: "", // Will be set during verification
          otp,
          otp_exp: otpExpiry
        }
      });
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
      return res.status(500).json({
        success: false,
        message: `Failed to send OTP to ${isEmail ? "email" : "phone"}`
      });
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${isEmail ? email : phone_number}`,
      userId: user.id,
      isNewUser: !user.name // If name is not set, it's likely a new user
    });

  } catch (error: any) {
    console.error("OTP request error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};


/**
 * Verify OTP and complete signup/login
 * @param req Request object with userId, otp, and user details for new users
 * @param res Response object
 */
export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { userId, otp, name, password } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required"
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otp_exp) {
      return res.status(400).json({
        success: false,
        message: "No OTP was generated for this user"
      });
    }

    if (isOTPExpired(user.otp_exp)) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    // Verify OTP
    if (user.otp !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Determine if this is a new user (no password set)
    const isNewUser = !user.name || user.password === "";

    // For new users, require additional information
    if (isNewUser && (!name || !password)) {
      return res.status(400).json({
        success: false,
        message: "Name and password are required for new users"
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Update user data
    const updateData: any = {
      jwt_token: token,
      otp: null,  // Clear OTP after successful verification
      otp_exp: null
    };

    // For new users, update with provided information
    if (isNewUser) {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.name = name;
      updateData.password = hashedPassword;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });

    // Return success response without sensitive data
    const { password: _, otp: __, otp_exp: ___, jwt_token, createdAt, updatedAt, ...userWithoutSensitiveData } = updatedUser;

    return res.status(200).json({
      success: true,
      message: isNewUser ? "Signup successful" : "Login successful",
      user: userWithoutSensitiveData,
      token,
      isNewUser
    });

  } catch (error: any) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};