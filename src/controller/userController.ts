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

// Get recruiter profile
export const getRecruiterProfile = asyncHandler(
  async (req: Request, res: Response) => {
    // @ts-ignore - userId will be added by auth middleware
    const userId = req.userId;

    if (!userId) {
      throw handleAuthorizationError("User ID is required");
    }

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

    // Check if user is recruiter and has recruiter details
    if (user.role !== "RECRUITER" || !user.recruiter_company_name) {
      throw handleNotFoundError("Recruiter Profile");
    }

    res.status(200).json({
      success: true,
      message: "Recruiter profile fetched successfully",
      data: {
        recruiterProfile: {
          id: user.id,
          fullName: user.name,
          email: user.email,
          mobileNumber: user.phone_number,
          companyName: user.recruiter_company_name,
          recruiterType: user.recruiter_type,
          companyRegistration: user.recruiter_company_registration,
          companyAddress: user.recruiter_company_address,
          companyLogo: user.recruiter_company_logo,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          industries: user.recruiterIndustries,
          gigTypes: user.recruiterGigTypes,
        },
        baseUrl: `${req.protocol}://${req.hostname}/images/`,
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

    // Validate required fields
    if (!fullName || !email || !mobileNumber) {
      throw handleValidationError(
        "Full Name, Email, and Mobile Number are required"
      );
    }

    if (!recruiterType) {
      throw handleValidationError(
        "Recruiter Type (Individual/Company/Agency/Event Organizer) is required"
      );
    }

    if (!companyName) {
      throw handleValidationError("Company/Organization Name is required");
    }

    if (!companyAddress) {
      throw handleValidationError("Company Address is required");
    }

    // Handle company logo upload if present
    let logoFilename = null;
    const files = req.files as { companyLogo?: Express.Multer.File[] };
    if (files && files.companyLogo && files.companyLogo.length > 0) {
      logoFilename = files.companyLogo[0].filename;
    }

    // Update user with recruiter details
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: fullName,
        email: email,
        phone_number: mobileNumber,
        recruiter_company_name: companyName,
        recruiter_type: recruiterType,
        recruiter_company_registration: companyRegistration || null,
        recruiter_company_address: companyAddress,
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
          createdAt: finalUser?.createdAt,
          updatedAt: finalUser?.updatedAt,
          industries: finalUser?.recruiterIndustries,
          gigTypes: finalUser?.recruiterGigTypes,
        },
      },
    });
  }
);
