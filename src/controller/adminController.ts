import { Request, Response } from "express";
import { PostApprovalStatus, ReportStatus, Role, Status } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parsePagination, paginationMeta, searchTerm, contains } from "../utils/pagination";
import { asyncHandler, handleNotFoundError, handleValidationError } from "../utils/errorHandler";
import { logger } from "../../utils/logger";
import { sendFCMNotification } from "../../utils/firebase";
import { broadcastNewJob } from "./postController";
import { queuePostApproved, queueApplicationStatusNotification, NotificationType } from "../queues/notificationQueue";
import { storeNotification } from "../utils/notificationStore";


const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /admin/users
 * Paginated. Filters: ?search (name/email/phone/company/registration),
 * ?role (single or comma-separated, e.g. RECRUITER,SERVICE_SEEKER), ?state,
 * ?phone=AVAILABLE|NOT_AVAILABLE, ?joined_days=7|15|30.
 * `meta` carries the numbers the admin UI shows outside the filtered page:
 * states to filter by, per-role totals, and recent-signup counts scoped to the
 * requested role(s) only (so the Users and Recruiters screens each get their own).
 */
export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip, take } = parsePagination(req);
  const search = searchTerm(req);
  const role = req.query.role as string | undefined;
  const state = (req.query.state as string | undefined)?.trim();
  const phone = req.query.phone as string | undefined;
  const joinedDays = parseInt((req.query.joined_days as string) || "", 10);

  const where: any = {};
  if (search) {
    where.OR = [
      { name: contains(search) },
      { email: contains(search) },
      { phone_number: contains(search) },
      { recruiter_company_name: contains(search) },
      { recruiter_company_registration: contains(search) },
    ];
  }
  const roles = (role || "")
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is Role => r in Role);
  const roleWhere: any = roles.length === 1 ? { role: roles[0] } : roles.length > 1 ? { role: { in: roles } } : {};
  Object.assign(where, roleWhere);
  if (state) where.state = state;
  if (phone === "AVAILABLE") where.phone_number = { not: null };
  else if (phone === "NOT_AVAILABLE") where.phone_number = null;
  if (Number.isFinite(joinedDays) && joinedDays > 0) {
    where.createdAt = { gte: new Date(Date.now() - joinedDays * DAY_MS) };
  }

  const since = (days: number) => ({ ...roleWhere, createdAt: { gte: new Date(Date.now() - days * DAY_MS) } });

  const [users, total, allTotal, roleTotal, joined7, joined15, joined30, stateRows, roleRows] = await Promise.all([
    prisma.user.findMany({
    where,
    skip,
    take,
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
      recruiter_company_logo: true,
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
    }),
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.user.count({ where: roleWhere }),
    prisma.user.count({ where: since(7) }),
    prisma.user.count({ where: since(15) }),
    prisma.user.count({ where: since(30) }),
    prisma.user.findMany({
      where: { state: { not: null } },
      distinct: ["state"],
      select: { state: true },
      orderBy: { state: "asc" },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);

  const roleCounts = roleRows.reduce((acc: Record<string, number>, r) => {
    if (r.role) acc[r.role] = r._count._all;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    data: users,
    pagination: paginationMeta(page, limit, total),
    meta: {
      total: allTotal,
      roleCounts,
      joinedCounts: { all: roleTotal, 7: joined7, 15: joined15, 30: joined30 },
      states: stateRows.map((r) => r.state).filter((v): v is string => !!v && v.trim() !== ""),
    },
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
 * PATCH /admin/users/:id  (Admin)
 * Full-authority edit of any user's details. Accepts any subset of the editable
 * fields below; email/phone/role are validated (uniqueness + allowed values).
 * Sensitive fields (otp, tokens, aadhaar, timestamps) are never writable here.
 */
export const adminUpdateUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const b = req.body || {};

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw handleNotFoundError("User");
  }

  const data: any = {};

  // Email (unique)
  if (b.email !== undefined && b.email !== null && String(b.email).trim() !== "") {
    const email = String(b.email).trim().toLowerCase();
    if (email !== user.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash && clash.id !== id) {
        throw handleValidationError("This email is already in use by another account");
      }
      data.email = email;
    }
  }

  // Phone (unique, nullable)
  if (b.phone_number !== undefined) {
    const phone = b.phone_number ? String(b.phone_number).trim() : null;
    if (phone && phone !== user.phone_number) {
      const clash = await prisma.user.findUnique({ where: { phone_number: phone } });
      if (clash && clash.id !== id) {
        throw handleValidationError("This phone number is already in use by another account");
      }
    }
    data.phone_number = phone;
  }

  // Role
  if (b.role !== undefined) {
    if (!["USER", "RECRUITER", "ADMIN", "SERVICE_SEEKER"].includes(b.role)) {
      throw handleValidationError("Invalid role");
    }
    if (b.role !== user.role && user.id === req.userId) {
      throw handleValidationError("You cannot change your own role");
    }
    data.role = b.role;
  }

  // is_active (guard self-deactivation)
  if (b.is_active !== undefined) {
    if (user.id === req.userId && b.is_active === false) {
      throw handleValidationError("You cannot deactivate your own account");
    }
    data.is_active = Boolean(b.is_active);
  }

  // Plain string fields
  const stringFields = [
    "name", "gender", "address", "state", "country", "english_level",
    "intro_video_link", "recruiter_company_name", "recruiter_type",
    "recruiter_company_registration", "recruiter_company_address",
  ];
  for (const f of stringFields) {
    if (b[f] !== undefined) data[f] = b[f] === "" ? null : b[f];
  }

  // Typed fields
  if (b.date_of_birth !== undefined) {
    data.date_of_birth = b.date_of_birth ? new Date(b.date_of_birth) : null;
  }
  if (b.height !== undefined) {
    data.height = b.height === "" || b.height === null ? null : parseFloat(b.height);
  }
  if (b.weight !== undefined) {
    data.weight = b.weight === "" || b.weight === null ? null : parseFloat(b.weight);
  }

  // Array / JSON fields
  if (b.skills !== undefined) {
    data.skills = Array.isArray(b.skills)
      ? b.skills
      : String(b.skills).split(",").map((s: string) => s.trim()).filter(Boolean);
  }
  if (b.experience !== undefined) {
    data.experience = Array.isArray(b.experience)
      ? b.experience
      : String(b.experience).split(",").map((s: string) => s.trim()).filter(Boolean);
  }
  if (b.education !== undefined) {
    data.education = b.education; // JSON — accepted as provided
  }

  if (Object.keys(data).length === 0) {
    throw handleValidationError("No editable fields provided");
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, phone_number: true, role: true,
      is_active: true, gender: true, date_of_birth: true, address: true,
      state: true, country: true, height: true, weight: true, english_level: true,
      experience: true, education: true, skills: true, intro_video_link: true,
      recruiter_company_name: true, recruiter_type: true,
      recruiter_company_registration: true, recruiter_company_address: true,
    },
  });

  logger.info(`Admin edited user ${id} — fields: ${Object.keys(data).join(", ")}`);

  res.status(200).json({
    success: true,
    message: "User updated successfully",
    data: updatedUser,
  });
});

/**
 * Get all job posts. Optional ?status=PENDING|APPROVED|REJECTED filter — handy
 * for the moderation queue (?status=PENDING).
 */
/**
 * GET /admin/posts
 * Paginated. Filters: ?search (title/category/company/recruiter/type),
 * ?status=PENDING|APPROVED|REJECTED, ?type_id=<id>|none,
 * ?schedule=COMPLETED|ONGOING (by endDate — used by the Post Reports screen).
 * `counts` is filter-independent: overall total + posts awaiting approval.
 */
export const getAllPosts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip, take } = parsePagination(req);
  const search = searchTerm(req);
  const status = req.query.status as string | undefined;
  const typeRaw = req.query.type_id as string | undefined;
  const schedule = req.query.schedule as string | undefined;

  const where: any = {};
  if (search) {
    where.OR = [
      { title: contains(search) },
      { category: contains(search) },
      { company_name: contains(search) },
      { user: { name: contains(search) } },
      { user: { email: contains(search) } },
      { user: { recruiter_company_name: contains(search) } },
      { type: { name: contains(search) } },
    ];
  }
  if (status && status in PostApprovalStatus) {
    where.approval_status = status as PostApprovalStatus;
  }
  if (typeRaw === "none") {
    where.type_id = null;
  } else if (typeRaw) {
    const typeId = parseInt(typeRaw, 10);
    if (!Number.isNaN(typeId)) where.type_id = typeId;
  }
  if (schedule === "COMPLETED") where.endDate = { lt: new Date() };
  else if (schedule === "ONGOING") where.endDate = { gte: new Date() };

  const [posts, total, allTotal, pendingTotal] = await Promise.all([
    prisma.post.findMany({
    where,
    skip,
    take,
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
    }),
    prisma.post.count({ where }),
    prisma.post.count(),
    prisma.post.count({ where: { approval_status: PostApprovalStatus.PENDING } }),
  ]);

  res.status(200).json({
    success: true,
    data: posts,
    pagination: paginationMeta(page, limit, total),
    counts: { all: allTotal, pending: pendingTotal },
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

    // Notify the recruiter (post owner) that their post is now live — push + email.
    const owner = await prisma.user.findUnique({
      where: { id: updatedPost.userId },
      select: { name: true, email: true, fcm_token: true, recruiter_company_name: true },
    });
    if (owner) {
      queuePostApproved({
        recruiterId: updatedPost.userId,
        recruiterName: owner.recruiter_company_name || owner.name || null,
        recruiterEmail: owner.email || null,
        postId: updatedPost.id,
        postTitle: updatedPost.title,
        fcmToken: owner.fcm_token || null,
      }).catch((err) =>
        logger.error("Failed to queue post-approved notification", { error: err })
      );
    }
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
/**
 * GET /admin/applications
 * Paginated. Filters: ?search (applicant name/email, post title/company, remark),
 * ?status=PENDING|APPROVED|REJECTED|CANCELLED|NOT_PRESENT.
 */
export const getAllApplications = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip, take } = parsePagination(req);
  const search = searchTerm(req);
  const status = req.query.status as string | undefined;

  const where: any = {};
  if (search) {
    where.OR = [
      { user: { name: contains(search) } },
      { user: { email: contains(search) } },
      { post: { title: contains(search) } },
      { post: { company_name: contains(search) } },
      { remark: contains(search) },
      { reject_reason: contains(search) },
    ];
  }
  if (status && status in Status) where.status = status as Status;

  const [applications, total] = await Promise.all([
    prisma.postApplied.findMany({
    where,
    skip,
    take,
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
    }),
    prisma.postApplied.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: applications,
    pagination: paginationMeta(page, limit, total),
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
          fcm_token: true,
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

  // Same applicant notification the recruiter path sends — only when the
  // decision actually changed, so editing a remark doesn't re-ping them.
  if ((status === "APPROVED" || status === "REJECTED") && app.status !== status) {
    queueApplicationStatusNotification({
      userId: updatedApp.userId,
      postId: updatedApp.postId,
      applicationId: updatedApp.id,
      postTitle: updatedApp.post.title,
      status,
      rejectReason: status === "REJECTED" ? remark ?? null : null,
      fcmToken: updatedApp.user.fcm_token,
    }).catch((err) => logger.error("Failed to queue application status notification", { error: err }));
  }

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
    throw handleValidationError(
      `${user.name || "This user"} has no device registered for push notifications (they haven't opened the app, or logged out).`
    );
  }

  // Persist to the user's in-app feed first so the message survives even if
  // the push fails; the push carries the row id for mark-as-read on tap.
  const stored = await storeNotification({
    userId: id,
    type: NotificationType.ADMIN_MESSAGE,
    title,
    body,
  });

  const result = await sendFCMNotification(user.fcm_token, {
    title,
    body,
    reminderId: id,
    type: NotificationType.ADMIN_MESSAGE,
    notificationId: stored.id,
  });

  if (!result.success) {
    const err = result.error || "";
    // A stale/invalid token can never be delivered to — clear it so the admin
    // list reflects reality and future sends don't keep failing on a dead token.
    const staleToken = /not registered|expired|invalid.*token|registration-token|invalid-argument/i.test(err);
    if (staleToken) {
      await prisma.user.update({ where: { id }, data: { fcm_token: null } }).catch(() => {});
      return res.status(409).json({
        success: false,
        message: `${user.name || "This user"}'s device is no longer reachable (they logged out or reinstalled the app). Their stale token has been cleared — push will work again once they reopen the app.`,
      });
    }
    // Otherwise it's a delivery/config problem (e.g. push not configured on this
    // environment). Surface the real reason so it's actionable.
    logger.error(`Admin push to user ${id} failed`, { error: err });
    return res.status(502).json({
      success: false,
      message: `Couldn't send the notification: ${err || "push service error"}. Please try again.`,
    });
  }

  logger.info(`Admin push sent to user ${id}`);
  res.status(200).json({
    success: true,
    message: `Notification sent to ${user.name || "the user"}.`,
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

/**
 * List post reports for admin review. Optional ?status filter
 * (PENDING | REVIEWED | DISMISSED) and ?page / ?limit pagination.
 * Includes the reported post (+ its owner) and the reporter, plus a
 * per-status count summary for dashboard badges.
 */
export const getPostReports = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const search = searchTerm(req);
  const { page, limit } = parsePagination(req);

  const where: any = {};
  if (status && status in ReportStatus) {
    where.status = status as ReportStatus;
  }
  if (search) {
    where.OR = [
      { reason: contains(search) },
      { details: contains(search) },
      { post: { title: contains(search) } },
      { reporter: { name: contains(search) } },
      { reporter: { email: contains(search) } },
    ];
  }

  const [reports, total, statusCounts] = await Promise.all([
    prisma.postReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        post: {
          select: {
            id: true,
            title: true,
            is_active: true,
            approval_status: true,
            user: {
              select: { id: true, name: true, email: true, recruiter_company_name: true },
            },
          },
        },
        reporter: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.postReport.count({ where }),
    prisma.postReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = statusCounts.reduce((acc: Record<string, number>, c) => {
    acc[c.status] = c._count._all;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    data: reports,
    pagination: paginationMeta(page, limit, total),
    counts,
  });
});

/**
 * Update the review status of a post report.
 * Body: { status: "PENDING" | "REVIEWED" | "DISMISSED" }
 */
export const updatePostReportStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body;

  if (!status || !(status in ReportStatus)) {
    throw handleValidationError('status must be one of "PENDING", "REVIEWED", or "DISMISSED"');
  }

  const existing = await prisma.postReport.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Report");
  }

  const updated = await prisma.postReport.update({
    where: { id },
    data: { status: status as ReportStatus },
  });

  logger.info(`Admin set report ${id} status to ${status}`);

  res.status(200).json({
    success: true,
    message: `Report marked ${status}`,
    data: updated,
  });
});


