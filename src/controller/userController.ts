import { Context } from "hono";
import {
  handleControllerError,
  handleNotFoundError,
  handleValidationError,
  handleAuthorizationError,
} from "../utils/errorHandler";
import { getPrisma } from "../lib/prisma";
import { uploadFile } from "../utils/storage";

// Get current user profile
export const getProfile = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

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

    return c.json({
      success: true,
      message: "Profile fetched successfully",
      data: {
        user: userWithoutPassword,
        // baseUrl: `${c.req.url.origin}/images/`, // Adjusted for Hono, but images are now S3/R2 keys
        baseUrl: "https://your-r2-worker-url.com/images/", // Update this with actual URL
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const updateProfile = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

    if (!userId) {
      throw handleAuthorizationError("User ID is required");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw handleNotFoundError("User");
    }

    // Parse body for multipart/form-data
    const body = await c.req.parseBody();

    const name = body['name'] as string;
    const phone_number = body['phone_number'] as string;
    const date_of_birth = body['date_of_birth'] as string;
    const address = body['address'] as string;
    const height = body['height'] as string;
    const weight = body['weight'] as string;
    const state = body['state'] as string;
    const gender = body['gender'] as string;
    const english_level = body['english_level'] as string;
    const country = body['country'] as string;
    const imageId = body['imageId'] as string;

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
        height: height ? parseFloat(height) : user.height,
        weight: weight ? parseFloat(weight) : user.weight,
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

    // Handle File Upload
    // Hono parseBody returns File | string | (File | string)[]
    const profile_images = body['profile_image'];

    if (profile_images) {
      const files = Array.isArray(profile_images) ? profile_images : [profile_images];
      const validFiles = files.filter(f => f instanceof File) as File[];

      if (validFiles.length > 0) {
        const uploadPromises = validFiles.map(file => uploadFile(file, 'profile', c.env));
        const uploadedFilenames = await Promise.all(uploadPromises);

        await prisma.images.createMany({
          data: uploadedFilenames.map((filename) => ({
            userId,
            image: filename,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (body['categories']) {
      await prisma.userCategory.deleteMany({
        where: {
          user_id: userId,
        },
      });
    }

    if (body['categories']) {
      const categoriesStr = body['categories'] as string;
      let categories = categoriesStr.split(",");
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

    return c.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: userWithoutPassword,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const getAllUsers = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);

    // Only admin can access - checked by route, but can double check
    // Logic from original code

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
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return c.json({
      success: true,
      message: "Users fetched successfully",
      data: {
        users,
        baseUrl: "https://your-r2-worker-url.com/images/",
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

// Get recruiter profile
export const getRecruiterProfile = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

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

    return c.json({
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
        baseUrl: "https://your-r2-worker-url.com/images/",
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

// Update recruiter profile
export const updateRecruiterProfile = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

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

    // Parse multipart/form-data
    const body = await c.req.parseBody();

    const fullName = body['fullName'] as string;
    const email = body['email'] as string;
    const mobileNumber = body['mobileNumber'] as string;
    const companyName = body['companyName'] as string;
    const recruiterType = body['recruiterType'] as string;
    const companyRegistration = body['companyRegistration'] as string;
    const companyAddress = body['companyAddress'] as string;
    const industries = body['industries'] as string;
    const gigTypes = body['gigTypes'] as string;

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
    const companyLogo = body['companyLogo'];
    if (companyLogo && companyLogo instanceof File) {
      logoFilename = await uploadFile(companyLogo, 'recruiter', c.env);
    }

    // Check if email is being changed to a different email
    if (email !== user.email) {
      // Verify new email is not already taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { email: email },
      });

      if (existingUser && existingUser.id !== userId) {
        return c.json({
          success: false,
          message: "This email is already in use by another account"
        }, 400); // Manually returning json for validation error behavior
      }
    }

    // Check if phone number is being changed to a different number
    if (mobileNumber !== user.phone_number) {
      // Verify new phone number is not already taken by another user
      const existingUserWithPhone = await prisma.user.findUnique({
        where: { phone_number: mobileNumber },
      });

      if (existingUserWithPhone && existingUserWithPhone.id !== userId) {
        return c.json({
          success: false,
          message: "This phone number is already in use by another account"
        }, 400);
      }
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

    return c.json({
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
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const updateFcmToken = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const { fcmToken } = await c.req.json();

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

    return c.json({
      success: true,
      message: "FCM token updated successfully",
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};
