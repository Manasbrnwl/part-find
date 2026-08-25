import { Request, Response } from "express";
import { PrismaClient, PostApprovalStatus } from "@prisma/client";
import { asyncHandler, handleNotFoundError, handleValidationError } from "../utils/errorHandler";
import { logger } from "../../utils/logger";
import { sendFCMNotification } from "../../utils/firebase";
import { broadcastNewJob } from "./postController";

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
      fcm_token: true,
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
 * Get all job posts. Optional ?status=PENDING|APPROVED|REJECTED filter — handy
 * for the moderation queue (?status=PENDING).
 */
export const getAllPosts = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const typeId = req.query.type_id ? parseInt(req.query.type_id as string, 10) : undefined;

  const where: any = {};
  if (status && status in PostApprovalStatus) {
    where.approval_status = status as PostApprovalStatus;
  }
  if (typeId && !Number.isNaN(typeId)) {
    where.type_id = typeId;
  }

  const posts = await prisma.post.findMany({
    where,
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
      type: { select: { id: true, name: true } },
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
 * Approve or reject a job post. A post is only visible to users once APPROVED.
 * On the first transition to APPROVED, the "new job posted" broadcast fires.
 * Body: { status: "APPROVED" | "REJECTED", remark?: string }
 */
export const updatePostApproval = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status, remark } = req.body;

  if (status !== "APPROVED" && status !== "REJECTED") {
    throw handleValidationError('status must be either "APPROVED" or "REJECTED"');
  }

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw handleNotFoundError("Post");
  }

  const wasApproved = post.approval_status === PostApprovalStatus.APPROVED;

  const updatedPost = await prisma.post.update({
    where: { id },
    data: {
      approval_status: status as PostApprovalStatus,
      approval_remark: status === "REJECTED" ? (remark ?? null) : null,
      approved_at: status === "APPROVED" ? new Date() : null,
    },
  });

  // Broadcast only on the first time a post goes live (avoid re-notifying if an
  // already-approved post is re-approved).
  if (status === "APPROVED" && !wasApproved) {
    broadcastNewJob(updatedPost).catch((err) =>
      logger.error("Failed to broadcast approved job", { error: err })
    );
  }

  logger.info(`Admin set post ${id} approval to ${status}`);

  res.status(200).json({
    success: true,
    message: `Job post ${status === "APPROVED" ? "approved" : "rejected"} successfully`,
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
 * GET /admin/posts/:id/applicants
 * Full applicant breakdown for a single post (admin can view ANY post).
 * Returns per-status counts plus the grouped lists: pending, approved, rejected
 * (with reject_reason), withdrawn (CANCELLED, with the withdrawal reason) and
 * not-present.
 */
export const getPostApplicants = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, recruiter_company_name: true } },
      type: { select: { id: true, name: true } },
    },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  const applications = await prisma.postApplied.findMany({
    where: { postId: id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      content: true,
      remark: true,
      reject_reason: true,
      attended: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_number: true,
          gender: true,
          is_active: true,
          userImages: {
            where: { is_deleted: false },
            select: { image: true },
            take: 1,
          },
        },
      },
    },
  });

  // Map each application to a normalized shape, surfacing the right reason field.
  const shape = (a: (typeof applications)[number]) => ({
    ...a,
    is_attended: a.attended,
    rejectReason: a.reject_reason || null,
    withdrawReason: a.status === "CANCELLED" ? a.remark || "No reason provided" : null,
  });

  const pending = applications.filter((a) => a.status === "PENDING").map(shape);
  const approved = applications.filter((a) => a.status === "APPROVED").map(shape);
  const rejected = applications.filter((a) => a.status === "REJECTED").map(shape);
  const withdrawn = applications.filter((a) => a.status === "CANCELLED").map(shape);
  const notPresent = applications.filter((a) => a.status === "NOT_PRESENT").map(shape);

  res.status(200).json({
    success: true,
    data: {
      post,
      counts: {
        total: applications.length,
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
        withdrawn: withdrawn.length,
        notPresent: notPresent.length,
      },
      pending,
      approved,
      rejected,
      withdrawn,
      notPresent,
      baseUrl: process.env.BASE_URL
        ? `${process.env.BASE_URL}/api/v1/images/profile/`
        : `${req.protocol}://${req.hostname}/api/v1/images/profile/`,
    },
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
      // A rejection reason is stored in the dedicated reject_reason field (shown
      // to the applicant); `remark` stays reserved for the withdrawal reason.
      ...(status === "REJECTED"
        ? { reject_reason: remark ?? null }
        : remark !== undefined
        ? { remark }
        : {}),
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

/**
 * Send FCM notification to a specific user
 */
export const sendUserNotification = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { title, body } = req.body;

  if (!title || !body) {
    throw handleValidationError("Title and body are required");
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { fcm_token: true, name: true },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  if (!user.fcm_token) {
    throw handleValidationError("User does not have an FCM token registered");
  }

  const result = await sendFCMNotification(user.fcm_token, {
    title,
    body,
    reminderId: id,
    type: "ADMIN_NOTIFICATION",
  });

  if (!result.success) {
    return res.status(500).json({
      success: false,
      message: `Failed to send FCM notification: ${result.error || "The token might be invalid or expired."}`,
    });
  }

  res.status(200).json({
    success: true,
    message: "FCM notification sent successfully to user",
  });
});

/**
 * Switch a user's role between USER and RECRUITER
 */
export const switchUserRole = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { role } = req.body;

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw handleNotFoundError("User");
  }

  // Prevent admin from changing their own role
  if (user.id === req.userId) {
    throw handleValidationError("Cannot change your own role");
  }

  let newRole: "USER" | "RECRUITER";
  if (role === "USER" || role === "RECRUITER") {
    newRole = role;
  } else {
    // Default to toggling between USER and RECRUITER
    newRole = user.role === "RECRUITER" ? "USER" : "RECRUITER";
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { role: newRole },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    }
  });

  logger.info(`Admin switched role for user ${id} to ${updatedUser.role}`);

  res.status(200).json({
    success: true,
    message: `User role changed to ${updatedUser.role} successfully`,
    data: updatedUser,
  });
});


