import express from "express";
import { PrismaClient, Status, PostApprovalStatus } from "@prisma/client";
import { Request, Response } from "express";
import { threadCpuUsage } from "node:process";
import {
  handleControllerError,
  handleNotFoundError,
  handleForbiddenError,
  handleValidationError,
  asyncHandler,
} from "../utils/errorHandler";
import {
  scheduleJobReminder,
  queueNewJobNotification,
  queueNewApplicationNotification,
  queueApplicationStatusNotification,
  queueAbsentWarning,
  queueCompletionCertificate,
} from "../queues/notificationQueue";
import { logger } from "../../utils/logger";
import { newPostAdminNotificationTemplate, postReportedAdminTemplate } from "../../utils/notification/emailTemplates";
const { sendEmailNotification } = require("../../utils/notification/email.notification");

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Email the Part Find team (official@part-find.org, override via ADMIN_NOTIFY_EMAIL)
 * when a recruiter creates a post that needs approval. Fire-and-forget.
 */
export async function notifyAdminNewPost(
  post: any,
  creator: {
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    recruiter_company_name?: string | null;
  } | null
) {
  const to = process.env.ADMIN_NOTIFY_EMAIL || "official@part-find.org";
  const tpl = newPostAdminNotificationTemplate(post, creator || {});
  await sendEmailNotification(to, tpl.subject, tpl.text, tpl.html);
}

/**
 * Email the Part Find team when a post crosses the report-alert threshold
 * (default 2 reports). Fire-and-forget.
 */
export async function notifyAdminPostReported(args: {
  postId: string;
  postTitle: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  reportCount: number;
  reasons: string[];
}) {
  const to = process.env.ADMIN_NOTIFY_EMAIL || "official@part-find.org";
  const tpl = postReportedAdminTemplate(args);
  await sendEmailNotification(to, tpl.subject, tpl.text, tpl.html);
}

/**
 * Broadcast a "new job posted" FCM push to all active USER accounts (except the
 * poster). Called when a post becomes live — i.e. on admin approval, or at
 * creation when an admin posts (auto-approved). Fire-and-forget.
 */
export async function broadcastNewJob(post: {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  userId: string;
}) {
  const usersWithTokens = await prisma.user.findMany({
    where: {
      is_active: true,
      fcm_token: { not: null },
      role: "USER",
      id: { not: post.userId }, // Exclude the poster
    },
    select: { fcm_token: true },
  });

  const fcmTokens = usersWithTokens
    .map((u) => u.fcm_token)
    .filter((token): token is string => Boolean(token));

  if (fcmTokens.length > 0) {
    await queueNewJobNotification({
      postId: post.id,
      postTitle: post.title,
      companyName: post.company_name || "A company",
      location: post.location || "TBD",
      fcmTokens,
    });
  }
}

export const createPosts = asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    content,
    requirement,
    total,
    girls = 0,
    boys = 0,
    lunch,
    is_urgent,
    startDate,
    endDate,
    location,
    responsibility,
    designation,
    payment,
    paymentGirls,
    paymentBoys,
    paymentDate,
    dressCode,
    company_name,
    categories,
    category,
    type_id,
    pay_period,
    latitude,
    longitude,
  } = req.body;
  const userId = req.userId;

  // Validation
  if (!userId) {
    throw handleValidationError("User ID is required");
  }
  if (!title || !content) {
    throw handleValidationError("Title and content are required");
  }

  // Validate the time basis (pay period) if supplied.
  const PAY_PERIODS = ["HOURLY", "DAILY", "MONTHLY"];
  let payPeriod: string | null = null;
  if (pay_period !== undefined && pay_period !== null && pay_period !== "") {
    payPeriod = String(pay_period).toUpperCase();
    if (!PAY_PERIODS.includes(payPeriod)) {
      throw handleValidationError("pay_period must be one of HOURLY, DAILY, MONTHLY");
    }
  }

  // Validate the employment type if one was supplied.
  let typeId: number | null = null;
  if (type_id !== undefined && type_id !== null && type_id !== "") {
    typeId = parseInt(type_id, 10);
    if (Number.isNaN(typeId)) {
      throw handleValidationError("type_id must be a valid number");
    }
    const typeExists = await prisma.postType.findFirst({
      where: { id: typeId, is_active: true },
    });
    if (!typeExists) {
      throw handleValidationError("Selected post type does not exist or is inactive");
    }
  }
  if (!startDate || !endDate) {
    throw handleValidationError("Start date and end date are required");
  }
  if (girls > 0 || boys > 0) {
    if (parseInt(girls) + parseInt(boys) != total)
      throw handleValidationError(
        "Sum of total boys and total girls should be equal to the vacancy"
      );
  }
  if (girls > 0 && !paymentGirls) {
    throw handleValidationError("Payment for girls is required when girls vacancies are specified");
  }
  if (boys > 0 && !paymentBoys) {
    throw handleValidationError("Payment for boys is required when boys vacancies are specified");
  }

  // New posts require admin approval before going live. Admin-created posts are
  // auto-approved (no point in an admin approving their own post).
  const creator = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      name: true,
      email: true,
      phone_number: true,
      recruiter_company_name: true,
    },
  });
  const autoApprove = creator?.role === "ADMIN";

  const post = await prisma.post.create({
    data: {
      userId: userId,
      approval_status: autoApprove
        ? PostApprovalStatus.APPROVED
        : PostApprovalStatus.PENDING,
      approved_at: autoApprove ? new Date() : null,
      title: title,
      content: content,
      role: designation || "No designation",
      requirement: requirement || "No requirement",
      total: Number(total) || 0,
      endDate: new Date(endDate),
      location: location || "No location",
      responsibility: responsibility || "No responsibility",
      startDate: new Date(startDate),
      payment: payment ? Number(payment) : null,
      paymentGirls: paymentGirls ? Number(paymentGirls) : null,
      paymentBoys: paymentBoys ? Number(paymentBoys) : null,
      paymentDate: new Date(paymentDate),
      dressCode: dressCode || null,
      company_name,
      category,
      type_id: typeId,
      pay_period: payPeriod as any,
      girls,
      boys,
      lunch,
      is_urgent: is_urgent === true || is_urgent === 'true',
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
    },
  });

  if (categories) {
    let categoriesList = categories.split(",");
    await prisma.postCategory.createMany({
      data: categoriesList?.map((id: string) => ({
        post_id: post.id,
        category_id: parseInt(id),
      })),
    });
  }

  // Only broadcast to users once the post is actually live (auto-approved admin
  // posts). Recruiter posts broadcast later, when an admin approves them.
  if (autoApprove) {
    broadcastNewJob(post).catch((err) =>
      logger.error("Failed to queue new job notification", { error: err })
    );
  } else {
    // Recruiter post pending approval — notify the Part Find team by email so
    // they can review + publish it. Fire-and-forget so it never blocks creation.
    notifyAdminNewPost(post, creator).catch((err) =>
      logger.error("Failed to email admin about new post", { error: err })
    );
  }

  res.status(201).json({
    success: true,
    message: autoApprove
      ? "Post created successfully"
      : "Post submitted and is pending admin approval",
    data: post,
  });
});

export const updatePost = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const {
    title,
    content,
    requirement,
    total,
    endDate,
    startDate,
    location,
    responsibility,
    designation,
    payment,
    paymentGirls,
    paymentBoys,
    paymentDate,
    dressCode,
    company_name,
    girls,
    boys,
    lunch,
    category,
    type_id,
    pay_period,
    latitude,
    longitude,
  } = req.body;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }

  const post = await prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  if (post.userId !== req.userId) {
    throw handleForbiddenError("You don't have permission to update this post");
  }

  if (girls > 0 || boys > 0) {
    if (parseInt(girls) + parseInt(boys) != total)
      throw handleValidationError(
        "Sum of total boys and total girls should be equal to the vacancy"
      );
  }

  // Resolve the employment type: undefined = leave unchanged, "" / null = clear,
  // a number = set (must be an existing, active type).
  let typeIdUpdate: number | null | undefined = undefined;
  if (type_id !== undefined) {
    if (type_id === null || type_id === "") {
      typeIdUpdate = null;
    } else {
      const parsed = parseInt(type_id, 10);
      if (Number.isNaN(parsed)) {
        throw handleValidationError("type_id must be a valid number");
      }
      const typeExists = await prisma.postType.findFirst({
        where: { id: parsed, is_active: true },
      });
      if (!typeExists) {
        throw handleValidationError("Selected post type does not exist or is inactive");
      }
      typeIdUpdate = parsed;
    }
  }

  // Resolve the time basis: undefined = leave unchanged, "" / null = clear.
  let payPeriodUpdate: string | null | undefined = undefined;
  if (pay_period !== undefined) {
    if (pay_period === null || pay_period === "") {
      payPeriodUpdate = null;
    } else {
      const pp = String(pay_period).toUpperCase();
      if (!["HOURLY", "DAILY", "MONTHLY"].includes(pp)) {
        throw handleValidationError("pay_period must be one of HOURLY, DAILY, MONTHLY");
      }
      payPeriodUpdate = pp;
    }
  }

  const updatedPost = await prisma.post.update({
    where: { id },
    data: {
      title: title || post.title,
      content: content || post.content,
      requirement: requirement || post.requirement,
      total: Number(total) || post.total,
      endDate: endDate ? new Date(endDate) : post.endDate,
      startDate: startDate ? new Date(startDate) : post.startDate,
      paymentDate: paymentDate ? new Date(paymentDate) : post.paymentDate,
      location: location || post.location,
      responsibility: responsibility || post.responsibility,
      role: designation || post.role,
      payment: payment !== undefined ? Number(payment) : post.payment,
      paymentGirls: paymentGirls !== undefined ? Number(paymentGirls) : post.paymentGirls,
      paymentBoys: paymentBoys !== undefined ? Number(paymentBoys) : post.paymentBoys,
      dressCode: dressCode !== undefined ? dressCode : post.dressCode,
      company_name,
      category: category || post.category,
      ...(typeIdUpdate !== undefined && { type_id: typeIdUpdate }),
      ...(payPeriodUpdate !== undefined && { pay_period: payPeriodUpdate as any }),
      girls,
      boys,
      lunch,
      latitude: latitude !== undefined ? parseFloat(latitude) : post.latitude,
      longitude: longitude !== undefined ? parseFloat(longitude) : post.longitude,
    },
  });

  res.status(200).json({
    success: true,
    message: "Post updated successfully",
    data: updatedPost,
  });
});

export const deletePost = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }

  const post = await prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  if (post.userId !== req.userId) {
    throw handleForbiddenError("You don't have permission to delete this post");
  }

  await prisma.post.update({
    data: { is_active: false },
    where: { id },
  });

  res.status(200).json({
    success: true,
    message: "Post deleted successfully",
  });
});

/**
 * PUT /post/recruitment/:id  (Recruiter owner / Admin)
 * Open or close applications for a post early, before its endDate.
 * Body: { is_recruiting: boolean }. Closing hides the post from the discovery
 * feeds and rejects new applications; re-opening restores it.
 */
export const updatePostRecruitment = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { is_recruiting } = req.body;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }
  if (typeof is_recruiting !== "boolean") {
    throw handleValidationError("is_recruiting (boolean) is required");
  }

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw handleNotFoundError("Post");
  }

  // Only the post owner (recruiter) or an admin may toggle recruitment.
  const requester = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });
  if (post.userId !== req.userId && requester?.role !== "ADMIN") {
    throw handleForbiddenError("You don't have permission to update this post");
  }

  const updated = await prisma.post.update({
    where: { id },
    data: { is_recruiting },
  });

  res.status(200).json({
    success: true,
    message: is_recruiting ? "Recruitment opened" : "Recruitment closed",
    data: updated,
  });
});

/**
 * PUT /post/attendance/:postId  (Recruiter owner / Admin)
 * Bulk-mark applicants as having attended the event. Attendees are issued a
 * participation certificate (a rating gets attached later if the recruiter
 * rates them). Body: { userIds: string[], attended?: boolean } (default true).
 */
export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId as string;
  const { userIds, attended } = req.body;

  if (!postId) {
    throw handleValidationError("Post ID is required");
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw handleValidationError("userIds (a non-empty array) is required");
  }
  const isAttended = attended !== false; // defaults to true

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw handleNotFoundError("Post");
  }

  const requester = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });
  if (post.userId !== req.userId && requester?.role !== "ADMIN") {
    throw handleForbiddenError("You don't have permission to manage this post");
  }

  // Only mark users who actually applied to this post.
  const applications = await prisma.postApplied.findMany({
    where: { postId, userId: { in: userIds } },
    select: { userId: true },
  });
  const validUserIds = applications.map((a) => a.userId);
  if (validUserIds.length === 0) {
    throw handleValidationError("None of the provided users applied to this post");
  }

  await prisma.postApplied.updateMany({
    where: { postId, userId: { in: validUserIds } },
    data: { attended: isAttended, attended_at: isAttended ? new Date() : null },
  });

  let certificatesIssued = 0;
  if (isAttended) {
    // Only users without an existing certificate get a fresh one — so re-marking
    // attendance never re-issues or re-emails a certificate already delivered.
    const preExisting = await prisma.certificate.findMany({
      where: { postId, userId: { in: validUserIds } },
      select: { userId: true },
    });
    const alreadyHave = new Set(preExisting.map((c) => c.userId));
    const newCertUserIds = validUserIds.filter((uid) => !alreadyHave.has(uid));

    if (newCertUserIds.length > 0) {
      const result = await prisma.certificate.createMany({
        data: newCertUserIds.map((uid) => ({
          userId: uid,
          postId,
          recruiterId: post.userId,
          rating: null, // participation certificate — no rating yet
        })),
        skipDuplicates: true,
      });
      certificatesIssued = result.count;

      // Deliver the participation certificate (email w/ PDF + push) to attendees.
      const [recruiter, users, certs] = await Promise.all([
        prisma.user.findUnique({
          where: { id: post.userId },
          select: { name: true },
        }),
        prisma.user.findMany({
          where: { id: { in: newCertUserIds } },
          select: { id: true, name: true, email: true, fcm_token: true },
        }),
        prisma.certificate.findMany({
          where: { postId, userId: { in: newCertUserIds } },
          select: { userId: true, issuedAt: true },
        }),
      ]);
      const issuedAtByUser = new Map(certs.map((c) => [c.userId, c.issuedAt]));

      for (const u of users) {
        if (!u.email) continue;
        await queueCompletionCertificate({
          userId: u.id,
          userName: u.name || "User",
          userEmail: u.email,
          postTitle: post.title,
          rating: null,
          recruiterName: recruiter?.name || "Recruiter",
          issuedAt: (issuedAtByUser.get(u.id) || new Date()).toISOString(),
          fcmToken: u.fcm_token || undefined,
        });
      }
    }
  } else {
    // Un-marking attendance removes attendance-only (unrated) certificates.
    await prisma.certificate.deleteMany({
      where: { postId, userId: { in: validUserIds }, rating: null },
    });
  }

  res.status(200).json({
    success: true,
    message: isAttended
      ? `Marked ${validUserIds.length} attendee(s); ${certificatesIssued} certificate(s) issued`
      : `Removed attendance for ${validUserIds.length} applicant(s)`,
    data: {
      postId,
      marked: validUserIds,
      count: validUserIds.length,
      attended: isAttended,
      certificatesIssued,
      skippedNotApplied: userIds.filter((u: string) => !validUserIds.includes(u)),
    },
  });
});

export const getAllPosts = asyncHandler(async (req: Request, res: Response) => {
  const location = req.query.location as string;
  const { limit = 10, page = 1 } = req.query;
  const typeId = req.query.type_id ? parseInt(req.query.type_id as string, 10) : undefined;

  const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
  const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
  const skip = (pageNumber - 1) * pageSize;
  const take = pageSize;

  const feedWhere = {
    startDate: { gt: new Date() },
    is_active: true,
    is_recruiting: true,
    approval_status: PostApprovalStatus.APPROVED,
    ...(typeId && !Number.isNaN(typeId) ? { type_id: typeId } : {}),
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: feedWhere,
      select: {
        id: true,
        userId: true,
        title: true,
        role: true,
        content: true,
        requirement: true,
        total: true,
        location: true,
        payment: true,
        paymentGirls: true,
        paymentBoys: true,
        paymentDate: true,
        dressCode: true,
        responsibility: true,
        company_name: true,
        girls: true,
        boys: true,
        lunch: true,
        is_active: true,
        is_recruiting: true,
        is_urgent: true,
        startDate: true,
        endDate: true,
        category: true,
        type_id: true,
        pay_period: true,
        type: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { comments: true },
        },
        comments: {
          select: {
            id: true,
            status: true,
          },
          where: {
            userId: req.userId,
          },
        },
        savePosts: {
          select: {
            id: true,
          },
          where: {
            userId: req.userId,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.post.count({
      where: feedWhere,
    }),
  ]);

  const postsWithFlag = posts.map(
    ({ comments, _count, savePosts, ...rest }) => ({
      ...rest,
      appliedFlag: comments.length > 0 ? 1 : 0,
      appliedStatus: comments?.[0]?.status || "Not Applied",
      appliedApplicants: _count.comments,
      savedFlag: savePosts.length > 0 ? 1 : 0,
    })
  );

  res.status(200).json({
    success: true,
    message: "Posts retrieved successfully",
    data: {
      posts: postsWithFlag,
      totalPages: Math.ceil(total / pageSize),
      currentPage: pageNumber,
      totalPosts: total,
    },
  });
});

export const getPostById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }

  const post = await prisma.post.findUnique({
    where: {
      id,
      is_active: true,
      approval_status: PostApprovalStatus.APPROVED,
    },
    include: {
      type: { select: { id: true, name: true } },
    },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  res.status(200).json({
    success: true,
    message: "Post retrieved successfully",
    data: post,
  });
});

export const applyToPost = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.userId;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }

  if (!userId) {
    throw handleValidationError("User ID is required");
  }

  const post = await prisma.post.findUnique({
    where: {
      id,
      is_active: true,
      approval_status: PostApprovalStatus.APPROVED,
    },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  if (post.endDate <= new Date()) {
    throw handleValidationError("Cannot apply to expired post");
  }

  if (!post.is_recruiting) {
    throw handleValidationError("Recruitment for this post is closed");
  }

  if (post.userId === userId) {
    throw handleValidationError("Cannot apply to your own post");
  }

  // Check if user already applied
  const existingApplication = await prisma.postApplied.findFirst({
    where: {
      userId,
      postId: id,
    },
  });

  if (existingApplication) {
    throw handleValidationError("You have already applied to this post");
  }

  // Get user's FCM token for scheduling notification and recruiter's token
  const [applicant, recruiter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { fcm_token: true, name: true, gender: true },
    }),
    prisma.user.findUnique({
      where: { id: post.userId },
      select: { fcm_token: true },
    }),
  ]);

  // Gender eligibility check
  // boys > 0 && girls === 0  → male only
  // girls > 0 && boys === 0  → female only
  // both > 0 || both === 0  → open to all
  const boysOnly = (post.boys ?? 0) > 0 && (post.girls ?? 0) === 0;
  const girlsOnly = (post.girls ?? 0) > 0 && (post.boys ?? 0) === 0;
  const userGender = applicant?.gender?.trim().toLowerCase();

  if (boysOnly && userGender !== "male") {
    throw handleValidationError("This post is open to male applicants only");
  }
  if (girlsOnly && userGender !== "female") {
    throw handleValidationError("This post is open to female applicants only");
  }

  const application = await prisma.postApplied.create({
    data: {
      userId,
      postId: id,
      content: req.body.content || "",
    },
  });

  // Schedule job reminder notification for 1 day before start
  if (applicant?.fcm_token) {
    scheduleJobReminder({
      userId,
      postId: id,
      postTitle: post.title,
      startDate: post.startDate,
      location: post.location || "TBD",
      fcmToken: applicant.fcm_token,
    }).catch((err) => logger.error("Failed to schedule job reminder", { error: err }));
  }

  // Notify recruiter about the new application
  if (recruiter?.fcm_token) {
    queueNewApplicationNotification({
      postId: id,
      postTitle: post.title,
      applicantName: applicant?.name || "A user",
      recruiterFcmToken: recruiter.fcm_token,
    }).catch((err) => logger.error("Failed to queue application notification", { error: err }));
  }

  res.status(201).json({
    success: true,
    message: "Successfully applied to post",
    data: application,
  });
});

export const getAppliedPosts = asyncHandler(
  async (req: Request, res: Response) => {
    const { limit = 10, page = 1 } = req.query;

    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize;

    const [posts, total] = await Promise.all([
      prisma.postApplied.findMany({
        select: {
          post: {
            select: {
              id: true,
              title: true,
              content: true,
              total: true,
              location: true,
              role: true,
              endDate: true,
              category: true,
              type_id: true,
              pay_period: true,
              type: { select: { id: true, name: true } },
              is_urgent: true,
              girls: true,
              boys: true,
              payment: true,
              paymentGirls: true,
              paymentBoys: true,
              dressCode: true,
            },
          },
          status: true,
          content: true,
          reject_reason: true,
        },
        where: {
          userId: req.userId,
          // Hide applications whose post was deleted by the recruiter
          // (deletePost sets is_active=false) — it should disappear for applicants.
          post: { is: { is_active: true } },
        },
        orderBy: {
          post: {
            endDate: "desc",
          },
        },
        skip,
        take,
      }),
      prisma.postApplied.count({
        where: {
          userId: req.userId,
          post: { is: { is_active: true } },
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Applied posts retrieved successfully",
      data: {
        posts: posts.map((post) => ({
          ...post.post,
          status: post.post.endDate > new Date() ? post.status : "closed",
          content: post.content,
          // Reason the recruiter/admin rejected this application (if any), so the
          // applicant can see why on their "applied posts" screen.
          rejectReason: post.status === "REJECTED" ? post.reject_reason || null : null,
        })),
        totalPages: Math.ceil(total / pageSize),
        currentPage: pageNumber,
        totalPosts: total,
      },
    });
  }
);

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }

  const valid = await prisma.post.findFirst({
    where: {
      AND: [{ userId: req.userId }, { id: id }],
    },
  });

  if (!valid) {
    throw handleForbiddenError(
      "You don't have permission to view applications for this post"
    );
  }

  const { filter, page = "1", limit = "10" } = req.query;
  const statusFilter: Status =
    typeof filter === "string" ? (filter as Status) : Status.PENDING;

  // pagination numbers
  const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
  const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
  const skip = (pageNumber - 1) * pageSize;
  const take = pageSize;

  const [list, total] = await Promise.all([
    prisma.postApplied.findMany({
      select: {
        id: true,
        status: true,
        content: true,
        remark: true,
        attended: true,
        attended_at: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            date_of_birth: true,
            phone_number: true,
            role: true,
            height: true,
            weight: true,
            gender: true,
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
                image: true,
              },
            },
          },
        },
      },
      where: {
        postId: id,
        status: statusFilter,
        user: {
          is: {
            is_active: true,
          },
        },
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.postApplied.count({
      where: {
        postId: id,
        status: statusFilter,
        user: {
          is: {
            is_active: true,
          },
        },
      },
    }),
  ]);

  // Fetch average ratings for all users in the list
  const userIds = list.map((app) => app.user.id);
  
  // Fetch existing ratings for this post to set the "alreadyrated" flag
  const existingRatings = await prisma.rating.findMany({
    where: {
      postId: id,
      recruiterId: req.userId,
      userId: { in: userIds },
    },
    select: {
      userId: true,
    },
  });

  const ratedUserSet = new Set(existingRatings.map(r => r.userId));

  const averageRatings = await prisma.rating.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
    },
    _avg: {
      rating: true,
    },
    _count: {
      rating: true,
    },
  });

  const ratingMap = new Map(
    averageRatings.map((r) => [
      r.userId,
      {
        averageRating: r._avg.rating ? Number(r._avg.rating.toFixed(1)) : 0,
        totalRatings: r._count.rating,
        alreadyrated: ratedUserSet.has(r.userId),
      },
    ])
  );

  const listWithRatings = list.map((app) => ({
    ...app,
    is_attended: app.attended,
    user: {
      ...app.user,
      overallRating: ratingMap.get(app.user.id) || {
        averageRating: 0,
        totalRatings: 0,
        alreadyrated: false,
      },
    },
  }));

  // Withdrawn applicants (status CANCELLED) with the reason they withdrew.
  // Always returned alongside the main list, regardless of the status filter.
  const withdrawnRaw = await prisma.postApplied.findMany({
    where: { postId: id, status: Status.CANCELLED },
    select: {
      id: true,
      status: true,
      remark: true,
      content: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_number: true,
          gender: true,
          userImages: {
            where: { is_deleted: false },
            select: { image: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const withdrawn = withdrawnRaw.map((app) => ({
    ...app,
    withdrawReason: app.remark || "No reason provided",
    withdrawnAt: app.updatedAt,
  }));

  res.status(200).json({
    success: true,
    message: "Post applications retrieved successfully",
    data: {
      list: listWithRatings,
      withdrawn,
      withdrawnCount: withdrawn.length,
      totalPages: Math.ceil(total / pageSize),
      currentPage: pageNumber,
      totalApplications: total,
      baseUrl: process.env.BASE_URL ? `${process.env.BASE_URL}/api/v1/images/profile/` : `${req.protocol}://${req.hostname}/api/v1/images/profile/`,
    },
  });
});

export const updateUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    // `reason`/`remark` carries the rejection reason shown to the applicant.
    const { status, reason, remark } = req.body;
    const rejectReason = reason ?? remark;

    if (!id) {
      throw handleValidationError("Application ID is required");
    }

    if (!status) {
      throw handleValidationError("Status is required");
    }

    // Verify the application exists and belongs to a post owned by the current user
    const application = await prisma.postApplied.findUnique({
      where: { id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        postId: true,
        status: true,
        post: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!application) {
      throw handleNotFoundError("Application");
    }

    if (application.post.userId !== req.userId) {
      throw handleForbiddenError(
        "You don't have permission to update this application status"
      );
    }

    const updatedApplication = await prisma.postApplied.update({
      where: { id },
      data: {
        status,
        // Persist the rejection reason so the applicant can see why they were
        // rejected; clear it if the status moves away from REJECTED.
        ...(status === "REJECTED"
          ? { reject_reason: rejectReason ?? null }
          : { reject_reason: null }),
      },
      include: {
        post: {
          select: { title: true }
        },
        user: {
          select: { email: true, name: true, fcm_token: true }
        }
      }
    });

    // Notify the applicant when a decision is made on their application.
    if (
      (status === "APPROVED" || status === "REJECTED") &&
      updatedApplication.user.fcm_token
    ) {
      await queueApplicationStatusNotification({
        userId: updatedApplication.userId,
        postTitle: updatedApplication.post.title,
        status,
        fcmToken: updatedApplication.user.fcm_token,
      });
    }

    // If status is NOT_PRESENT, flag the user and send warning
    if (status === "NOT_PRESENT") {
      // 1. Store in FlaggedUser table
      await prisma.flaggedUser.create({
        data: {
          userId: updatedApplication.userId,
          reason: `No-show for event: ${updatedApplication.post.title}`,
        },
      });

      // 2. Queue warning notification
      if (updatedApplication.user.email) {
        await queueAbsentWarning({
          userId: updatedApplication.userId,
          userName: updatedApplication.user.name || "User",
          userEmail: updatedApplication.user.email,
          postTitle: updatedApplication.post.title,
          fcmToken: updatedApplication.user.fcm_token || undefined,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Application status updated successfully",
      data: updatedApplication,
    });
  }
);

export const recruiterGetPost = asyncHandler(
  async (req: Request, res: Response) => {
    const { filter } = req.query;

    const dateFilter =
      filter === "COMPLETED"
        ? { lt: new Date() } // completed = endDate in past
        : { gt: new Date() }; // not completed = endDate in future

    const [postCount, posts] = await Promise.all([
      prisma.post.count({
        where: {
          userId: req.userId,
          is_active: true,
          endDate: dateFilter,
        },
      }),
      prisma.post.findMany({
        include: {
          _count: {
            select: { comments: true },
          },
          type: { select: { id: true, name: true } },
        },
        where: {
          userId: req.userId,
          is_active: true,
          endDate: dateFilter,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const postIds = posts.map((p) => p.id);

    // Fetch application counts grouping by status for these specific posts
    // Note: groupBy with relation filters (like post: { userId: ... }) can cause UNKNOWN_DATABASE_ERROR
    const postApplicationsCount =
      postIds.length > 0
        ? await prisma.postApplied.groupBy({
            by: ["status"],
            where: {
              postId: { in: postIds },
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const postsWithCount = posts.map(({ _count, ...rest }) => ({
      ...rest,
      appliedApplicants: _count.comments,
    }));

    res.status(200).json({
      success: true,
      message: "Recruiter posts retrieved successfully",
      data: {
        posts: postsWithCount,
        dashboard: postApplicationsCount,
        count: postCount,
      },
    });
  }
);

export const savePost = asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId as string;

  if (!postId) {
    throw handleValidationError("Post ID is required");
  }

  if (!req.userId) {
    throw handleValidationError("User ID is required");
  }

  // Check if post exists and is active
  const postExists = await prisma.post.findUnique({
    where: {
      id: postId,
      is_active: true,
      approval_status: PostApprovalStatus.APPROVED,
    },
  });

  if (!postExists) {
    throw handleNotFoundError("Post");
  }

  // Check if post is already saved by this user
  const existingSave = await prisma.savePosts.findFirst({
    where: {
      userId: req.userId,
      postId: postId,
    },
  });

  if (existingSave) {
    throw handleValidationError("Post is already saved");
  }

  const savedPost = await prisma.savePosts.create({
    data: {
      userId: req.userId,
      postId: postId,
    },
  });

  res.status(201).json({
    success: true,
    message: "Post saved successfully",
    data: savedPost,
  });
});

export const getSavePosts = asyncHandler(
  async (req: Request, res: Response) => {
    const saved = await prisma.savePosts.findMany({
      where: {
        userId: req.userId,
        post: {
          is: {
            is_active: true,
            approval_status: PostApprovalStatus.APPROVED,
            endDate: { gte: new Date() },
          },
        },
      },
      select: {
        id: true,
        post: {
          select: {
            id: true,
            userId: true,
            title: true,
            role: true,
            content: true,
            requirement: true,
            total: true,
            location: true,
            payment: true,
            paymentGirls: true,
            paymentBoys: true,
            paymentDate: true,
            dressCode: true,
            responsibility: true,
            company_name: true,
            girls: true,
            boys: true,
            lunch: true,
            is_active: true,
            is_recruiting: true,
            is_urgent: true,
            startDate: true,
            endDate: true,
            category: true,
            type_id: true,
            pay_period: true,
            type: { select: { id: true, name: true } },
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { comments: true },
            },
            comments: {
              select: {
                id: true,
                status: true,
              },
              where: {
                userId: req.userId,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const savedPosts = saved.map(({ post }) => {
      const { _count, comments, ...rest } = post;

      return {
        ...rest,
        appliedFlag: comments.length > 0 ? 1 : 0,
        appliedStatus: comments?.[0]?.status || "Not Applied",
        appliedApplicants: _count.comments,
      };
    });

    res.status(200).json({
      success: true,
      message: "Saved posts retrieved successfully",
      data: savedPosts,
    });
  }
);

/**
 * Get nearby posts based on user's location
 * Uses Haversine formula to calculate distance
 */
export const getNearbyPosts = asyncHandler(
  async (req: Request, res: Response) => {
    const { lat, long, radius = 10, limit = 20, page = 1 } = req.query;

    if (!lat || !long) {
      throw handleValidationError("Latitude and longitude are required");
    }

    const userLat = parseFloat(lat as string);
    const userLong = parseFloat(long as string);
    const radiusKm = parseFloat(radius as string) || 10;
    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit as string, 10) || 20, 1);
    const typeId = req.query.type_id ? parseInt(req.query.type_id as string, 10) : undefined;

    // Get all active posts with coordinates
    const allPosts = await prisma.post.findMany({
      where: {
        endDate: { gt: new Date() },
        is_active: true,
        is_recruiting: true,
        approval_status: PostApprovalStatus.APPROVED,
        latitude: { not: null },
        longitude: { not: null },
        ...(typeId && !Number.isNaN(typeId) ? { type_id: typeId } : {}),
      },
      select: {
        id: true,
        userId: true,
        title: true,
        role: true,
        content: true,
        requirement: true,
        total: true,
        location: true,
        payment: true,
        paymentGirls: true,
        paymentBoys: true,
        paymentDate: true,
        dressCode: true,
        responsibility: true,
        company_name: true,
        girls: true,
        boys: true,
        lunch: true,
        is_active: true,
        is_recruiting: true,
        is_urgent: true,
        startDate: true,
        endDate: true,
        category: true,
        type_id: true,
        pay_period: true,
        type: { select: { id: true, name: true } },
        latitude: true,
        longitude: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { comments: true },
        },
        comments: {
          select: {
            id: true,
            status: true,
          },
          where: {
            userId: req.userId,
          },
        },
        savePosts: {
          select: {
            id: true,
          },
          where: {
            userId: req.userId,
          },
        },
      },
    });

    // Calculate distance using Haversine formula
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371; // Earth's radius in km
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Filter posts by distance and add distance field
    const nearbyPosts = allPosts
      .map((post) => {
        const distance = calculateDistance(
          userLat,
          userLong,
          post.latitude!,
          post.longitude!
        );
        return { ...post, distance: Math.round(distance * 10) / 10 }; // Round to 1 decimal
      })
      .filter((post) => post.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    // Paginate results
    const total = nearbyPosts.length;
    const skip = (pageNumber - 1) * pageSize;
    const paginatedPosts = nearbyPosts.slice(skip, skip + pageSize);

    // Format response
    const postsWithFlags = paginatedPosts.map(
      ({ comments, _count, savePosts, ...rest }) => ({
        ...rest,
        appliedFlag: comments.length > 0 ? 1 : 0,
        appliedStatus: comments?.[0]?.status || "Not Applied",
        appliedApplicants: _count.comments,
        savedFlag: savePosts.length > 0 ? 1 : 0,
      })
    );

    res.status(200).json({
      success: true,
      message: "Nearby posts retrieved successfully",
      data: {
        posts: postsWithFlags,
        totalPages: Math.ceil(total / pageSize),
        currentPage: pageNumber,
        totalPosts: total,
        searchRadius: radiusKm,
      },
    });
  }
);

export const cancelApplication = asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId as string;
  const { remark } = req.body;
  const userId = req.userId;

  if (!postId) {
    throw handleValidationError("Post ID is required");
  }

  if (!userId) {
    throw handleValidationError("User ID is required");
  }

  const application = await prisma.postApplied.findUnique({
    where: {
      userId_postId: {
        userId: userId as string,
        postId: postId,
      },
    },
  });

  if (!application) {
    throw handleNotFoundError("Application");
  }

  const updatedApplication = await prisma.postApplied.update({
    where: { id: application.id },
    data: {
      status: "CANCELLED" as any,
      remark: remark || "Cancelled by user",
    },
  });

  res.status(200).json({
    success: true,
    message: "Application cancelled successfully",
    data: updatedApplication,
  });
});

export const unsavePost = asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId as string;

  if (!postId) {
    throw handleValidationError("Post ID is required");
  }

  if (!req.userId) {
    throw handleValidationError("User ID is required");
  }

  const existingSave = await prisma.savePosts.findFirst({
    where: {
      userId: req.userId,
      postId: postId,
    },
  });

  if (!existingSave) {
    throw handleNotFoundError("Saved post entry");
  }

  await prisma.savePosts.delete({
    where: {
      id: existingSave.id,
    },
  });

  res.status(200).json({
    success: true,
    message: "Post unsaved successfully",
  });
});

/**
 * Report a post with a reason (spam, scam, inappropriate, etc.).
 * A user may report a given post only once. Reports are stored as PENDING
 * for admin review.
 * Body: { reason: string (required), details?: string }
 */
export const reportPost = asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId as string;
  const reporterId = req.userId as string;
  const { reason, details } = req.body;

  if (!postId) throw handleValidationError("Post ID is required");
  if (!reporterId) throw handleValidationError("User ID is required");

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason.length < 3) {
    throw handleValidationError("A valid reason is required (at least 3 characters)");
  }
  if (trimmedReason.length > 500) {
    throw handleValidationError("Reason must be 500 characters or fewer");
  }
  const trimmedDetails =
    typeof details === "string" && details.trim() ? details.trim().slice(0, 1000) : null;

  // The post must exist
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, title: true },
  });
  if (!post) throw handleNotFoundError("Post");

  // You can't report your own post
  if (post.userId === reporterId) {
    throw handleValidationError("You cannot report your own post");
  }

  // One report per user per post
  const existing = await prisma.postReport.findFirst({
    where: { postId, reporterId },
    select: { id: true },
  });
  if (existing) {
    throw handleValidationError("You have already reported this post");
  }

  let report;
  try {
    report = await prisma.postReport.create({
      data: { postId, reporterId, reason: trimmedReason, details: trimmedDetails },
    });
  } catch (err: any) {
    // Unique-constraint race (reported twice near-simultaneously)
    if (err?.code === "P2002") {
      throw handleValidationError("You have already reported this post");
    }
    throw err;
  }

  logger.info(`Post ${postId} reported by user ${reporterId} (reason: ${trimmedReason})`);

  // Auto-moderation: alert the team by email once a post crosses the report
  // threshold (default 2). Fires once, exactly when the count reaches it.
  const reportThreshold = parseInt(process.env.REPORT_ALERT_THRESHOLD || "2", 10);
  const reportCount = await prisma.postReport.count({ where: { postId } });
  if (reportCount === reportThreshold) {
    const [reports, owner] = await Promise.all([
      prisma.postReport.findMany({ where: { postId }, select: { reason: true }, orderBy: { createdAt: "asc" } }),
      prisma.user.findUnique({
        where: { id: post.userId },
        select: { name: true, email: true, recruiter_company_name: true },
      }),
    ]);
    notifyAdminPostReported({
      postId,
      postTitle: post.title,
      ownerName: owner?.recruiter_company_name || owner?.name || null,
      ownerEmail: owner?.email || null,
      reportCount,
      reasons: reports.map((r) => r.reason),
    }).catch((err) => logger.error("Failed to send post-report admin alert", { error: err }));
  }

  res.status(201).json({
    success: true,
    message: "Post reported successfully. Our team will review it.",
    data: {
      id: report.id,
      postId: report.postId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
});
