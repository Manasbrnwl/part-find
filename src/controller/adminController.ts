import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler, handleNotFoundError, handleValidationError } from "../utils/errorHandler";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

/**
 * Get all users
 */
export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      phone_number: true,
      role: true,
      is_active: true,
      createdAt: true,
      recruiter_company_name: true,
      recruiter_type: true,
      recruiter_company_registration: true,
      recruiter_company_address: true,
      date_of_birth: true,
      gender: true,
      height: true,
      weight: true,
      english_level: true,
      address: true,
      state: true,
      country: true,
      experience: true,
      education: true,
      skills: true,
      intro_video_link: true,
      userImages: {
        where: { is_deleted: false },
        select: {
          id: true,
          image: true,
        }
      },
    }
  });

  res.status(200).json({
    success: true,
    data: users,
  });
});

/**
 * Toggle user active/inactive status
 */
export const toggleUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  // Prevent admin from deactivating themselves
  if (user.id === req.userId) {
    throw handleValidationError("Cannot toggle your own active status");
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { is_active: !user.is_active },
    select: {
      id: true,
      email: true,
      name: true,
      is_active: true,
    }
  });

  logger.info(`Admin toggled status for user ${id} to ${updatedUser.is_active}`);

  res.status(200).json({
    success: true,
    message: `User account ${updatedUser.is_active ? 'activated' : 'deactivated'} successfully`,
    data: updatedUser,
  });
});

/**
 * Get all job posts
 */
export const getAllPosts = asyncHandler(async (req: Request, res: Response) => {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          recruiter_company_name: true,
        }
      },
      _count: {
        select: { comments: true } // comments are the applications
      }
    }
  });

  res.status(200).json({
    success: true,
    data: posts,
  });
});

/**
 * Toggle job post active/inactive status
 */
export const togglePostStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const post = await prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  const updatedPost = await prisma.post.update({
    where: { id },
    data: { is_active: !post.is_active },
  });

  logger.info(`Admin toggled status for post ${id} to ${updatedPost.is_active}`);

  res.status(200).json({
    success: true,
    message: `Job post ${updatedPost.is_active ? 'activated' : 'deactivated'} successfully`,
    data: updatedPost,
  });
});

/**
 * Get all applications
 */
export const getAllApplications = asyncHandler(async (req: Request, res: Response) => {
  const applications = await prisma.postApplied.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_number: true,
          gender: true,
          date_of_birth: true,
          is_active: true,
          height: true,
          weight: true,
          english_level: true,
          address: true,
          state: true,
          country: true,
          experience: true,
          education: true,
          skills: true,
          intro_video_link: true,
          userImages: {
            where: { is_deleted: false },
            select: {
              id: true,
              image: true,
            }
          },
        }
      },
      post: {
        select: {
          id: true,
          title: true,
          company_name: true,
          is_active: true,
        }
      }
    }
  });

  res.status(200).json({
    success: true,
    data: applications,
  });
});

/**
 * Delete / deactivate an application (remove candidate application)
 */
export const deleteApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const app = await prisma.postApplied.findUnique({
    where: { id },
  });

  if (!app) {
    throw handleNotFoundError("Application");
  }

  await prisma.postApplied.delete({
    where: { id },
  });

  logger.info(`Admin deleted application ${id}`);

  res.status(200).json({
    success: true,
    message: "Application deleted/deactivated successfully",
  });
});

/**
 * Update application status or remark (e.g. rejection reason)
 */
export const updateApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status, remark } = req.body;

  const app = await prisma.postApplied.findUnique({
    where: { id },
  });

  if (!app) {
    throw handleNotFoundError("Application");
  }

  const updatedApp = await prisma.postApplied.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(remark !== undefined && { remark }),
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        }
      },
      post: {
        select: {
          title: true,
        }
      }
    }
  });

  logger.info(`Admin updated application ${id} status to ${updatedApp.status}`);

  res.status(200).json({
    success: true,
    message: "Application updated successfully",
    data: updatedApp,
  });
});
