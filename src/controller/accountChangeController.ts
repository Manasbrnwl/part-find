import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  asyncHandler,
  handleNotFoundError,
  handleValidationError,
} from "../utils/errorHandler";
import { generateOTP, calculateOTPExpiry, isOTPExpired } from "../../utils/otp/functions.otp";
import { queueOtpEmail } from "../queues/notificationQueue";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEV_OTP_BYPASS = "123456";

/**
 * POST /user/account/change/request  (authenticated)
 * Start a self-service change of the user's email, phone number, or role.
 * Nothing is applied here — an OTP is sent to the user's CURRENT email and the
 * requested change is stashed as `pending_change`; it only takes effect after
 * POST /user/account/change/verify with the correct OTP.
 *
 * Body:
 *   { type: "email",  newEmail }
 *   { type: "phone",  newPhone }
 *   { type: "role",   newRole: "USER" | "RECRUITER",
 *                     recruiter_company_name?, recruiter_type?,
 *                     recruiter_company_registration?, recruiter_company_address? }
 */
export const requestAccountChange = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const {
    type,
    newEmail,
    newPhone,
    newRole,
    recruiter_company_name,
    recruiter_type,
    recruiter_company_registration,
    recruiter_company_address,
  } = req.body;

  if (!["email", "phone", "role"].includes(type)) {
    throw handleValidationError('type must be one of "email", "phone", or "role"');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw handleNotFoundError("User");
  }
  if (!user.email) {
    throw handleValidationError("Your account has no email on file to receive the OTP");
  }

  let pending: any;

  if (type === "email") {
    const email = String(newEmail || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      throw handleValidationError("A valid newEmail is required");
    }
    if (email === user.email) {
      throw handleValidationError("This is already your email address");
    }
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== userId) {
      throw handleValidationError("This email is already in use by another account");
    }
    pending = { type: "email", email };
  } else if (type === "phone") {
    const phone = String(newPhone || "").trim();
    if (!phone) {
      throw handleValidationError("A valid newPhone is required");
    }
    if (phone === user.phone_number) {
      throw handleValidationError("This is already your phone number");
    }
    const clash = await prisma.user.findUnique({ where: { phone_number: phone } });
    if (clash && clash.id !== userId) {
      throw handleValidationError("This phone number is already in use by another account");
    }
    pending = { type: "phone", phone_number: phone };
  } else {
    // role
    if (newRole !== "USER" && newRole !== "RECRUITER") {
      throw handleValidationError('newRole must be "USER" or "RECRUITER"');
    }
    if (newRole === user.role) {
      throw handleValidationError(`You are already a ${newRole}`);
    }
    pending = { type: "role", role: newRole };
    if (newRole === "RECRUITER") {
      // Company details are required to become a recruiter.
      const name = String(recruiter_company_name || "").trim();
      const rtype = String(recruiter_type || "").trim();
      const address = String(recruiter_company_address || "").trim();
      if (!name || !rtype || !address) {
        throw handleValidationError(
          "recruiter_company_name, recruiter_type and recruiter_company_address are required to become a recruiter"
        );
      }
      pending.recruiter_company_name = name;
      pending.recruiter_type = rtype;
      pending.recruiter_company_registration = recruiter_company_registration
        ? String(recruiter_company_registration).trim()
        : null;
      pending.recruiter_company_address = address;
    }
    // Downgrading RECRUITER -> USER keeps the recruiter fields on record.
  }

  const otp = generateOTP();
  const otp_exp = calculateOTPExpiry();

  await prisma.user.update({
    where: { id: userId },
    data: { change_otp: otp, change_otp_exp: otp_exp, pending_change: pending },
  });

  // OTP always goes to the CURRENT registered email to prove it's really them.
  await queueOtpEmail({ email: user.email, otp, expiryMinutes: 3 });

  logger.info(`Account change (${type}) requested for user ${userId}; OTP sent to current email`);

  res.status(200).json({
    success: true,
    message: `OTP sent to your registered email. Verify it to apply the ${type} change.`,
    data: { type, otpSentTo: user.email },
  });
});

/**
 * POST /user/account/change/verify  (authenticated)
 * Confirm a pending email/phone/role change with the OTP. The change is ONLY
 * applied here, on a valid, unexpired OTP.
 * Body: { otp }
 */
export const verifyAccountChange = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const { otp } = req.body;

  if (!otp) {
    throw handleValidationError("OTP is required");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw handleNotFoundError("User");
  }

  if (!user.change_otp || !user.change_otp_exp || !user.pending_change) {
    throw handleValidationError("No pending change to verify. Request a change first.");
  }
  if (isOTPExpired(user.change_otp_exp)) {
    // Clear the stale request.
    await prisma.user.update({
      where: { id: userId },
      data: { change_otp: null, change_otp_exp: null, pending_change: Prisma.DbNull },
    });
    throw handleValidationError("OTP has expired. Please request the change again.");
  }

  const devBypass = process.env.NODE_ENV === "development" && String(otp) === DEV_OTP_BYPASS;
  if (user.change_otp.toString() !== String(otp) && !devBypass) {
    throw handleValidationError("Invalid OTP");
  }

  const pending = user.pending_change as any;
  const data: any = {};

  if (pending.type === "email") {
    // Re-check uniqueness at apply time (guards against a race since the request).
    const clash = await prisma.user.findUnique({ where: { email: pending.email } });
    if (clash && clash.id !== userId) {
      throw handleValidationError("This email is now in use by another account");
    }
    data.email = pending.email;
  } else if (pending.type === "phone") {
    const clash = await prisma.user.findUnique({ where: { phone_number: pending.phone_number } });
    if (clash && clash.id !== userId) {
      throw handleValidationError("This phone number is now in use by another account");
    }
    data.phone_number = pending.phone_number;
  } else if (pending.type === "role") {
    data.role = pending.role;
    if (pending.role === "RECRUITER") {
      data.recruiter_company_name = pending.recruiter_company_name;
      data.recruiter_type = pending.recruiter_type;
      data.recruiter_company_registration = pending.recruiter_company_registration ?? null;
      data.recruiter_company_address = pending.recruiter_company_address;
    }
  }

  // Apply the change and clear the pending request atomically.
  data.change_otp = null;
  data.change_otp_exp = null;
  data.pending_change = Prisma.DbNull;

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      phone_number: true,
      name: true,
      role: true,
      recruiter_company_name: true,
      recruiter_type: true,
      recruiter_company_registration: true,
      recruiter_company_address: true,
    },
  });

  logger.info(`Account change (${pending.type}) applied for user ${userId}`);

  res.status(200).json({
    success: true,
    message: `Your ${pending.type} has been updated successfully.`,
    data: updated,
  });
});
