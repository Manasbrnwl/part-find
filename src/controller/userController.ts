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
import { logger } from "../../utils/logger";
import { isValidAadhaarNumber, normalizeAadhaar, maskAadhaar } from "../utils/aadhaar";
import { getImage, deleteImage } from "../lib/storage";

dotenv.config();

const prisma = new PrismaClient();

// Aadhaar card images are sensitive KYC docs — stored under the private "aadhaar"
// category (S3 or local), never publicly served, and only reachable via the
// authenticated, ownership-checked routes below.

/**
 * Fetch and shape recruiter-only profile data.
 * Shared by GET /users/profile (when role is RECRUITER) and GET /users/recruiter-profile.
 */
const fetchRecruiterProfileData = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      recruiterIndustries: {
        where: { is_active: true },
        select: {
          id: true,
          industry: true,
        },
      },
      recruiterGigTypes: {
        where: { is_active: true },
        select: {
          id: true,
          gigType: true,
        },
      },
    },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  if (user.role !== "RECRUITER") {
    throw handleNotFoundError("Recruiter Profile");
  }

  return {
    id: user.id,
    fullName: user.name,
    email: user.email,
    mobileNumber: user.phone_number,
    companyName: user.recruiter_company_name,
    recruiterType: user.recruiter_type,
    companyRegistration: user.recruiter_company_registration,
    companyAddress: user.recruiter_company_address,
    companyLogo: user.recruiter_company_logo,
    aadhaarNumber: maskAadhaar(user.aadhaar_number),
    aadhaarOnFile: !!user.aadhaar_image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    industries: user.recruiterIndustries,
    gigTypes: user.recruiterGigTypes,
  };
};

// Get current user profile - role aware: RECRUITER logins get recruiter-only
// data, everyone else (USER/ADMIN) gets user-only data (no recruiter fields).
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore - userId will be added by auth middleware
  const userId = req.userId;

  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }

  const roleCheck = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!roleCheck) {
    throw handleNotFoundError("User");
  }

  if (roleCheck.role === "RECRUITER") {
    const recruiterProfile = await fetchRecruiterProfileData(userId);
    res.status(200).json({
      success: true,
      message: "Recruiter profile fetched successfully",
      data: {
        recruiterProfile,
        baseUrl: process.env.BASE_URL ? `${process.env.BASE_URL}/api/v1/images/recruiter/` : `${req.protocol}://${req.hostname}/api/v1/images/recruiter/`,
      },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userImages: {
        where: { is_deleted: false },
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

  // Return user data without password, createdAt, updatedAt, and recruiter-only fields
  const {
    createdAt,
    updatedAt,
    jwt_token,
    otp,
    otp_exp,
    fcm_token,
    recruiter_company_name,
    recruiter_type,
    recruiter_company_registration,
    recruiter_company_address,
    recruiter_company_logo,
    aadhaar_number,
    aadhaar_image,
    ...userWithoutPassword
  } = user;

  res.status(200).json({
    success: true,
    message: "Profile fetched successfully",
    data: {
      user: {
        ...userWithoutPassword,
        aadhaar_number: maskAadhaar(aadhaar_number),
        aadhaar_on_file: !!aadhaar_image,
      },
      baseUrl: process.env.BASE_URL ? `${process.env.BASE_URL}/api/v1/images/profile/` : `${req.protocol}://${req.hostname}/api/v1/images/profile/`,
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
      email,
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
      skills,
      intro_video_link,
    } = req.body;

    // Email / phone number changes are login identifiers, so they must stay
    // unique. Only validate + apply them when actually changed.
    const newEmail = email ? String(email).trim().toLowerCase() : undefined;
    if (newEmail && newEmail !== user.email) {
      const existingEmail = await prisma.user.findUnique({ where: { email: newEmail } });
      if (existingEmail && existingEmail.id !== userId) {
        throw handleValidationError("This email is already in use by another account");
      }
    }

    const newPhone = phone_number ? String(phone_number).trim() : undefined;
    if (newPhone && newPhone !== user.phone_number) {
      const existingPhone = await prisma.user.findUnique({ where: { phone_number: newPhone } });
      if (existingPhone && existingPhone.id !== userId) {
        throw handleValidationError("This phone number is already in use by another account");
      }
    }

    const parseToArray = (input: any): string[] | undefined => {
      if (!input) return undefined;
      if (Array.isArray(input)) return input.filter((item) => typeof item === 'string');
      if (typeof input === "string") {
        const trimmed = input.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
           try {
             const parsed = JSON.parse(trimmed);
             if (Array.isArray(parsed)) {
               return parsed.map((item: any) => {
                 if (typeof item === 'string') return item;
                 return item.company_name || item.institution_name || '';
               }).filter((i) => i !== '');
             }
           } catch(e) {}
        }
        return trimmed.split(",").map((i) => i.trim()).filter((i) => i !== "");
      }
      return undefined;
    };

    const parseToJsonArray = (input: any): any[] | undefined => {
      if (!input) return undefined;

      const tryParseLoose = (str: string) => {
        try {
          return JSON.parse(str);
        } catch (e) {
          // Attempt to parse loose unquoted quasi-JSON strings like "{degree: 12th Pass, institution_name: du}"
          const trimmed = str.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
             const inner = trimmed.slice(1, -1);
             const obj: any = {};
             inner.split(',').forEach(pair => {
                const [key, ...rest] = pair.split(':');
                if (key && rest.length > 0) {
                   obj[key.trim()] = rest.join(':').trim();
                }
             });
             return Object.keys(obj).length > 0 ? obj : str;
          }
          return str;
        }
      };

      if (Array.isArray(input)) {
        return input.map(item => (typeof item === 'string' ? tryParseLoose(item) : item));
      }

      if (typeof input === "string") {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          const loose = tryParseLoose(input);
          return (typeof loose === 'object' && loose !== null) ? [loose] : undefined;
        }
      }
      
      return undefined;
    };

    const parsedExperience = parseToArray(req.body.experience);
    const parsedEducation = parseToJsonArray(req.body.education);
    const parsedSkills = parseToArray(skills);

    // Update user data
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        ...(newEmail && { email: newEmail }),
        ...(newPhone && { phone_number: newPhone }),
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
        ...(parsedExperience !== undefined && { experience: parsedExperience }),
        ...(parsedEducation !== undefined && { education: parsedEducation }),
        ...(parsedSkills !== undefined && { skills: parsedSkills }),
        intro_video_link: intro_video_link !== undefined ? intro_video_link : user.intro_video_link
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
      aadhaar_number,
      aadhaar_image,
      ...userWithoutPassword
    } = updatedUser;

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: {
          ...userWithoutPassword,
          aadhaar_number: maskAadhaar(aadhaar_number),
          aadhaar_on_file: !!aadhaar_image,
        },
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
      skills: true,
      intro_video_link: true,
      createdAt: true,
      updatedAt: true,
      userImages: {
        where: { is_deleted: false },
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
      baseUrl: process.env.BASE_URL ? `${process.env.BASE_URL}/api/v1/images/profile/` : `${req.protocol}://${req.hostname}/api/v1/images/profile/`,
    },
  });
});

// Get recruiter profile
export const getRecruiterProfile = asyncHandler(
  async (req: Request, res: Response) => {
    // @ts-ignore - userId will be added by auth middleware
    const userId = req.userId;

    if (!userId) {
      throw handleAuthorizationError("User ID is required");
    }

    const recruiterProfile = await fetchRecruiterProfileData(userId);

    res.status(200).json({
      success: true,
      message: "Recruiter profile fetched successfully",
      data: {
        recruiterProfile,
        baseUrl: process.env.BASE_URL ? `${process.env.BASE_URL}/api/v1/images/recruiter/` : `${req.protocol}://${req.hostname}/api/v1/images/recruiter/`,
      },
    });
  }
);

// Update recruiter profile
export const updateRecruiterProfile = asyncHandler(
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

    // Verify user is a recruiter
    if (user.role !== "RECRUITER") {
      throw handleAuthorizationError(
        "Only recruiters can update recruiter profile"
      );
    }

    const {
      fullName,
      email,
      mobileNumber,
      companyName,
      recruiterType,
      companyRegistration,
      companyAddress,
      industries,
      gigTypes,
    } = req.body;

    const finalFullName = fullName || user.name;
    const finalEmail = email || user.email;
    const finalMobileNumber = mobileNumber || user.phone_number;
    const finalRecruiterType = recruiterType || user.recruiter_type;
    const finalCompanyName = companyName || user.recruiter_company_name;
    const finalCompanyAddress = companyAddress || user.recruiter_company_address;

    const lowercasedEmail = finalEmail ? finalEmail.toLowerCase() : undefined;

    // Validate that we at least have an email (required by schema)
    if (!finalEmail) {
      throw handleValidationError("Email is required");
    }

    // Handle company logo upload if present
    let logoFilename = null;
    const files = req.files as { companyLogo?: Express.Multer.File[] };
    if (files && files.companyLogo && files.companyLogo.length > 0) {
      logoFilename = files.companyLogo[0].filename;
    }

    // Check if email is being changed to a different email
    if (lowercasedEmail && lowercasedEmail !== user.email) {
      // Verify new email is not already taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { email: lowercasedEmail },
      });

      if (existingUser && existingUser.id !== userId) {
        throw handleValidationError("This email is already in use by another account");
      }
    }

    // Check if phone number is being changed to a different number
    if (finalMobileNumber && finalMobileNumber !== user.phone_number) {
      // Verify new phone number is not already taken by another user
      const existingUserWithPhone = await prisma.user.findUnique({
        where: { phone_number: finalMobileNumber },
      });

      if (existingUserWithPhone && existingUserWithPhone.id !== userId) {
        throw handleValidationError("This phone number is already in use by another account");
      }
    }

    // Update user with recruiter details
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: finalFullName,
        email: lowercasedEmail,
        phone_number: finalMobileNumber,
        recruiter_company_name: finalCompanyName,
        recruiter_type: finalRecruiterType,
        recruiter_company_registration: companyRegistration || user.recruiter_company_registration,
        recruiter_company_address: finalCompanyAddress,
        recruiter_company_logo: logoFilename || user.recruiter_company_logo,
      },
    });

    // Update industries if provided
    if (industries) {
      // Delete existing industries
      await prisma.recruiterIndustry.deleteMany({
        where: {
          user_id: userId,
        },
      });

      // Create new industries
      const industriesList = Array.isArray(industries)
        ? industries
        : industries.split(",");

      if (industriesList.length > 0) {
        await prisma.recruiterIndustry.createMany({
          data: industriesList.map((industry: string) => ({
            user_id: userId,
            industry: industry.trim(),
          })),
          skipDuplicates: true,
        });
      }
    }

    // Update gig types if provided
    if (gigTypes) {
      // Delete existing gig types
      await prisma.recruiterGigType.deleteMany({
        where: {
          user_id: userId,
        },
      });

      // Create new gig types
      const gigTypesList = Array.isArray(gigTypes)
        ? gigTypes
        : gigTypes.split(",");

      if (gigTypesList.length > 0) {
        await prisma.recruiterGigType.createMany({
          data: gigTypesList.map((gigType: string) => ({
            user_id: userId,
            gigType: gigType.trim(),
          })),
          skipDuplicates: true,
        });
      }
    }

    // Fetch updated profile with all relations
    const finalUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        recruiterIndustries: {
          where: { is_active: true },
          select: {
            id: true,
            industry: true,
          },
        },
        recruiterGigTypes: {
          where: { is_active: true },
          select: {
            id: true,
            gigType: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Recruiter profile updated successfully",
      data: {
        recruiterProfile: {
          id: finalUser?.id,
          fullName: finalUser?.name,
          email: finalUser?.email,
          mobileNumber: finalUser?.phone_number,
          companyName: finalUser?.recruiter_company_name,
          recruiterType: finalUser?.recruiter_type,
          companyRegistration: finalUser?.recruiter_company_registration,
          companyAddress: finalUser?.recruiter_company_address,
          companyLogo: finalUser?.recruiter_company_logo,
          aadhaarNumber: maskAadhaar(finalUser?.aadhaar_number),
          aadhaarOnFile: !!finalUser?.aadhaar_image,
          createdAt: finalUser?.createdAt,
          updatedAt: finalUser?.updatedAt,
          industries: finalUser?.recruiterIndustries,
          gigTypes: finalUser?.recruiterGigTypes,
        },
      },
    });
  }
);

/**
 * Update FCM token for push notifications
 * Called when the client's FCM token refreshes or on app startup
 */
export const updateFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { fcmToken } = req.body;

  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }

  if (!fcmToken) {
    throw handleValidationError("FCM token is required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { fcm_token: fcmToken },
  });

  res.status(200).json({
    success: true,
    message: "FCM token updated successfully",
  });
});


/**
 * DELETE /users/images/:id
 * Soft delete a user image
 */
export const deleteUserImage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const imageId = req.params.id as string;

  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }

  const image = await prisma.images.findUnique({
    where: { id: imageId },
  });

  if (!image) {
    throw handleNotFoundError("Image");
  }

  if (image.userId !== userId) {
    throw handleAuthorizationError("You are not authorized to delete this image");
  }

  await prisma.images.update({
    where: { id: imageId },
    data: { is_deleted: true },
  });

  res.status(200).json({
    success: true,
    message: "Image deleted successfully",
  });
});

/**
 * GET /users/profile/completion
 * Returns profile completion percentage and per-field breakdown.
 * Supports both USER and RECRUITER roles.
 */
export const getProfileCompletion = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userImages: { where: { is_deleted: false }, select: { id: true } },
      UserCategory: { select: { id: true } },
      recruiterIndustries: { where: { is_active: true }, select: { id: true } },
      recruiterGigTypes: { where: { is_active: true }, select: { id: true } },
    },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  let fields: Record<string, boolean>;

  if (user.role === "RECRUITER") {
    fields = {
      name: !!user.name?.trim(),
      email: !!user.email?.trim(),
      phone_number: !!user.phone_number?.trim(),
      recruiter_company_name: !!user.recruiter_company_name?.trim(),
      recruiter_type: !!user.recruiter_type?.trim(),
      recruiter_company_address: !!user.recruiter_company_address?.trim(),
      recruiter_company_registration: !!user.recruiter_company_registration?.trim(),
      recruiter_company_logo: !!user.recruiter_company_logo?.trim(),
      industries: user.recruiterIndustries.length > 0,
      gig_types: user.recruiterGigTypes.length > 0,
      aadhaar: !!user.aadhaar_number && !!user.aadhaar_image,
    };
  } else {
    const education = Array.isArray(user.education) ? user.education : [];
    fields = {
      name: !!user.name?.trim(),
      email: !!user.email?.trim(),
      phone_number: !!user.phone_number?.trim(),
      date_of_birth: !!user.date_of_birth,
      gender: !!user.gender?.trim(),
      address: !!user.address?.trim(),
      state: !!user.state?.trim(),
      country: !!user.country?.trim(),
      english_level: !!user.english_level?.trim(),
      skills: user.skills.length > 0,
      experience: user.experience.length > 0,
      education: education.length > 0,
      intro_video_link: !!user.intro_video_link?.trim(),
      profile_image: user.userImages.length > 0,
      categories: user.UserCategory.length > 0,
      aadhaar: !!user.aadhaar_number && !!user.aadhaar_image,
    };
  }

  const total = Object.keys(fields).length;
  const completed = Object.values(fields).filter(Boolean).length;
  const percentage = Math.round((completed / total) * 100);

  res.status(200).json({
    success: true,
    message: "Profile completion fetched successfully",
    data: {
      percentage,
      completed,
      total,
      fields,
    },
  });
});

/**
 * PUT /users/aadhaar  (multipart: aadhaar_number, aadhaar_image)
 * Submit / update the caller's Aadhaar (KYC). Works for any role.
 * The number is validated (12 digits + Verhoeff), stored normalized, and only
 * ever returned masked. The image is written to the private AADHAAR_DIR.
 */
export const updateAadhaar = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw handleNotFoundError("User");
  }

  const files = req.files as { aadhaar_image?: Express.Multer.File[] } | undefined;
  const uploaded = files?.aadhaar_image?.[0];

  const rawNumber = (req.body.aadhaar_number ?? "").toString().trim();
  if (!rawNumber) {
    if (uploaded) deleteImage("aadhaar", uploaded.filename);
    throw handleValidationError("Aadhaar number is required");
  }
  if (!isValidAadhaarNumber(rawNumber)) {
    if (uploaded) deleteImage("aadhaar", uploaded.filename);
    throw handleValidationError("Invalid Aadhaar number");
  }
  const normalized = normalizeAadhaar(rawNumber);

  // The image is mandatory, but only require a fresh upload if none is on file.
  if (!uploaded && !user.aadhaar_image) {
    throw handleValidationError("Aadhaar image is required");
  }

  // Friendlier duplicate check than a raw unique-constraint error.
  const existing = await prisma.user.findFirst({
    where: { aadhaar_number: normalized, NOT: { id: userId } },
    select: { id: true },
  });
  if (existing) {
    if (uploaded) deleteImage("aadhaar", uploaded.filename);
    throw handleValidationError("This Aadhaar is already registered to another account");
  }

  const oldImage = user.aadhaar_image;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        aadhaar_number: normalized,
        ...(uploaded && { aadhaar_image: uploaded.filename }),
      },
    });
  } catch (err: any) {
    if (uploaded) deleteImage("aadhaar", uploaded.filename);
    if (err?.code === "P2002") {
      throw handleValidationError("This Aadhaar is already registered to another account");
    }
    throw err;
  }

  // Clean up the replaced image, if any.
  if (uploaded && oldImage && oldImage !== uploaded.filename) {
    deleteImage("aadhaar", oldImage);
  }

  // Never log the Aadhaar number.
  logger.info(`Aadhaar submitted for user ${userId}`);

  res.status(200).json({
    success: true,
    message: "Aadhaar details saved successfully",
    data: {
      aadhaar_number: maskAadhaar(normalized),
      aadhaar_on_file: true,
    },
  });
});

/**
 * Stream a user's Aadhaar image from private storage (S3 or local). Shared by
 * the self and admin routes; the route layer authorizes the caller.
 */
async function streamAadhaarImage(res: Response, userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { aadhaar_image: true },
  });

  if (!target || !target.aadhaar_image) {
    throw handleNotFoundError("Aadhaar image");
  }

  const img = await getImage("aadhaar", target.aadhaar_image);
  if (!img) {
    throw handleNotFoundError("Aadhaar image");
  }

  res.setHeader("Content-Type", img.contentType);
  res.setHeader("Cache-Control", "private, no-store");
  img.stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  img.stream.pipe(res);
}

/** GET /users/aadhaar/image — the caller's own Aadhaar image. */
export const getMyAadhaarImage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    throw handleAuthorizationError("User ID is required");
  }
  await streamAadhaarImage(res, userId);
});

/** GET /users/aadhaar/image/:userId — admin-only access to any user's image. */
export const getAadhaarImageByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const targetId = String(req.params.userId || "");
  if (!targetId) {
    throw handleValidationError("User ID is required");
  }
  await streamAadhaarImage(res, targetId);
});
