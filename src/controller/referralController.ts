import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  asyncHandler,
  handleNotFoundError,
  handleValidationError,
} from "../utils/errorHandler";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

// Unambiguous alphabet (no 0/O/1/I) for human-friendly codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateReferralCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const existing = await prisma.referralCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  // Extremely unlikely; fall back to a longer code.
  return generateReferralCode(12);
}

/**
 * Apply a referral code to a freshly-signed-up user. Increments the code's
 * usage_count and records it on the user (once). Returns the normalized code
 * that was applied, or null if it wasn't (missing/invalid/inactive/self-referral).
 *
 * Callers are responsible for the "only at first-time signup, only once" gating
 * (i.e. only call this for a new account that has no referred_by_code yet).
 */
export async function applyReferralCodeToUser(
  userId: string,
  userEmail: string | null | undefined,
  rawCode: string
): Promise<string | null> {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) return null;

  const referral = await prisma.referralCode.findFirst({
    where: { code, is_active: true },
  });
  if (!referral) return null;

  // No self-referral: a user can't use a code registered to their own email.
  if (
    userEmail &&
    referral.email &&
    referral.email.toLowerCase() === userEmail.toLowerCase()
  ) {
    return null;
  }

  await prisma.$transaction([
    prisma.referralCode.update({
      where: { id: referral.id },
      data: { usage_count: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { referred_by_code: code },
    }),
  ]);

  logger.info(`Referral code ${code} applied for user ${userId}`);
  return code;
}

/**
 * GET /referral/validate/:code  (public)
 * Lets the signup screen check a code before submitting. Reveals only the
 * owner's name (not their email).
 */
export const validateReferral = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  if (!code) {
    throw handleValidationError("Referral code is required");
  }

  const referral = await prisma.referralCode.findFirst({
    where: { code, is_active: true },
    select: { code: true, name: true },
  });

  res.status(200).json({
    success: true,
    data: {
      valid: !!referral,
      code: referral?.code || null,
      name: referral?.name || null,
    },
  });
});

/**
 * GET /admin/referrals  (admin)
 */
export const getReferrals = asyncHandler(async (_req: Request, res: Response) => {
  const referrals = await prisma.referralCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ success: true, data: referrals });
});

/**
 * POST /admin/referrals  (admin)
 * Body: { name, email, code?, is_active? }. Code is generated if omitted.
 */
export const createReferral = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, code, is_active } = req.body;

  if (!name || !String(name).trim()) {
    throw handleValidationError("Owner name is required");
  }
  if (!email || !String(email).trim()) {
    throw handleValidationError("Owner email is required");
  }

  let finalCode = code ? String(code).trim().toUpperCase() : "";
  if (finalCode) {
    const existing = await prisma.referralCode.findUnique({ where: { code: finalCode } });
    if (existing) {
      throw handleValidationError("This referral code already exists");
    }
  } else {
    finalCode = await generateUniqueReferralCode();
  }

  const referral = await prisma.referralCode.create({
    data: {
      code: finalCode,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      is_active: is_active === undefined ? true : !!is_active,
    },
  });

  logger.info(`Referral code ${finalCode} created for ${referral.email}`);
  res.status(201).json({
    success: true,
    message: "Referral code created successfully",
    data: referral,
  });
});

/**
 * PATCH /admin/referrals/:id  (admin)
 * Body: any of { name, email, code, is_active }.
 */
export const updateReferral = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, email, code, is_active } = req.body;

  const referral = await prisma.referralCode.findUnique({ where: { id } });
  if (!referral) {
    throw handleNotFoundError("Referral code");
  }

  let finalCode: string | undefined;
  if (code !== undefined) {
    finalCode = String(code).trim().toUpperCase();
    if (!finalCode) throw handleValidationError("Referral code cannot be empty");
    if (finalCode !== referral.code) {
      const clash = await prisma.referralCode.findUnique({ where: { code: finalCode } });
      if (clash) throw handleValidationError("This referral code already exists");
    }
  }

  const updated = await prisma.referralCode.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(email !== undefined && { email: String(email).trim().toLowerCase() }),
      ...(finalCode !== undefined && { code: finalCode }),
      ...(is_active !== undefined && { is_active: !!is_active }),
    },
  });

  res.status(200).json({
    success: true,
    message: "Referral code updated successfully",
    data: updated,
  });
});

/**
 * DELETE /admin/referrals/:id  (admin)
 */
export const deleteReferral = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const referral = await prisma.referralCode.findUnique({ where: { id } });
  if (!referral) {
    throw handleNotFoundError("Referral code");
  }

  await prisma.referralCode.delete({ where: { id } });

  logger.info(`Referral code ${referral.code} deleted`);
  res.status(200).json({ success: true, message: "Referral code deleted successfully" });
});
