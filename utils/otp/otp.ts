import { PrismaClient } from "@prisma/client";
import { calculateOTPExpiry, generateOTP, isOTPExpired, matchOTP } from "./functions.otp";

const prisma = new PrismaClient();
const User = prisma.user;
const sendEmailNotification = require("./emailService");
// const sendSMSNotification = require("./smsService");

/**
 * Generate and save OTP for a user
 * @param {string} identifier - Email or phone number
 * @param {boolean} isEmail - Whether the identifier is an email
 * @returns {Promise<object>} Result with status and user
 */
exports.generateAndSaveOTP = async (identifier: string, isEmail = true) => {
  try {
    let user;

    if (isEmail) {
      user = await User.findUnique({ where: { email: identifier } });
    } else {
      user = await User.findUnique({ where: { phone_number: identifier } });
    }

    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = calculateOTPExpiry();

    // Save unhashed OTP for sending to user
    const plainOTP = otp;

    // Save OTP to user (will be hashed via pre-save hook)
    await User.update({
      where: { id: user.id },
      data: { otp, otp_exp: otpExpiry }
    });

    // Send OTP via email or SMS
    let sent = false;
    if (isEmail) {
      sent = sendEmailNotification(
        user.email,
        "Medicine Reminder App - Login OTP",
        `Your OTP for login is: ${plainOTP}. It will expire in 10 minutes.`,
        `<h1>Login OTP</h1><p>Your OTP for login is: <strong>${plainOTP}</strong></p><p>It will expire in 10 minutes.</p>`
      )
        .then((res: any) => res)
        .catch(() => false);
    } else if (user.phone_number) {
      //   sent = await sendSMSNotification(
      //     user.phone,
      //     `Your Medicine Reminder App login OTP is: ${plainOTP}. It will expire in 10 minutes.`
      //   )
      //     .then((res: any) => res)
      //     .catch(() => false);
    }

    if (!sent) {
      return {
        success: false,
        message: `Failed to send OTP to ${isEmail ? "email" : "phone"}`
      };
    }

    return {
      success: true,
      message: `OTP sent to ${isEmail ? user.email : user.phone_number}`,
      userId: user.id
    };
  } catch (error) {
    console.error("OTP generation error:", error);
    return { success: false, message: "Error generating OTP" };
  }
};

/**
 * Verify OTP for a user
 * @param {string} userId - User ID
 * @param {string} otp - OTP to verify
 * @returns {Promise<object>} Result with status and user
 */
exports.verifyOTP = async (userId: string, otp: number) => {
  try {
    const user = await User.findUnique({
      where: { id: userId },
      select: { otp: true, otp_exp: true }
    });

    if (!user) {
      return { success: false, message: "User not found" };
    }

    if (!user.otp || !user.otp_exp) {
      return { success: false, message: "No OTP was generated for this user" };
    }

    if (isOTPExpired(user.otp_exp)) {
      return { success: false, message: "OTP has expired" };
    }

    const isOTPValid = await matchOTP(user.otp, otp);

    if (!isOTPValid) {
      return { success: false, message: "Invalid OTP" };
    }

    // Clear OTP after successful verification
    user.otp = null;
    user.otp_exp = null;
    await User.update({
      where: { id: userId },
      data: { otp: null, otp_exp: null }
    });

    return { success: true, user };
  } catch (error) {
    console.error("OTP verification error:", error);
    return { success: false, message: "Error verifying OTP" };
  }
};
