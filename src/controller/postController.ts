import express from "express";
import { PrismaClient, Status } from "@prisma/client";
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
  queueAbsentWarning,
} from "../queues/notificationQueue";
import { logger } from "../../utils/logger";

const router = express.Router();
const prisma = new PrismaClient();

export const createPosts = asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    content,
    requirement,
    total,
    girls = 0,
    boys = 0,
    lunch,
    startDate,
    endDate,
    location,
    responsibility,
    designation,
    payment,
    paymentDate,
    company_name,
    categories,
    category,
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
  if (!startDate || !endDate) {
    throw handleValidationError("Start date and end date are required");
  }
  if (girls > 0 || boys > 0) {
    if (parseInt(girls) + parseInt(boys) != total)
      throw handleValidationError(
        "Sum of total boys and total girls should be equal to the vacancy"
      );
  }

  const post = await prisma.post.create({
    data: {
      userId: userId,
      title: title,
      content: content,
      role: designation || "No designation",
      requirement: requirement || "No requirement",
      total: Number(total) || 0,
      endDate: new Date(endDate),
      location: location || "No location",
      responsibility: responsibility || "No responsibility",
      startDate: new Date(startDate),
      payment: payment || "No payment",
      paymentDate: new Date(paymentDate),
      company_name,
      category,
      girls,
      boys,
      lunch,
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

  // Queue FCM notification to all active users with FCM tokens
  const usersWithTokens = await prisma.user.findMany({
    where: {
      is_active: true,
      fcm_token: { not: null },
      id: { not: userId }, // Exclude the recruiter who created the post
    },
    select: { fcm_token: true },
  });

  const fcmTokens = usersWithTokens
    .map((u) => u.fcm_token)
    .filter((token): token is string => Boolean(token));

  if (fcmTokens.length > 0) {
    queueNewJobNotification({
      postId: post.id,
      postTitle: post.title,
      companyName: company_name || "A company",
      location: location || "TBD",
      fcmTokens,
    }).catch((err) => logger.error("Failed to queue new job notification", { error: err }));
  }

  res.status(201).json({
    success: true,
    message: "Post created successfully",
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
    paymentDate,
    company_name,
    girls,
    boys,
    lunch,
    category,
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
      payment: Number(payment) || post.payment,
      company_name,
      category: category || post.category,
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

export const getAllPosts = asyncHandler(async (req: Request, res: Response) => {
  const location = req.query.location as string;
  const { limit = 10, page = 1 } = req.query;

  const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
  const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
  const skip = (pageNumber - 1) * pageSize;
  const take = pageSize;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: {
        endDate: { gt: new Date() },
        is_active: true,
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
        paymentDate: true,
        responsibility: true,
        company_name: true,
        girls: true,
        boys: true,
        lunch: true,
        is_active: true,
        startDate: true,
        endDate: true,
        category: true,
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
      where: {
        endDate: { gt: new Date() },
        is_active: true,
      },
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
    },
  });

  if (!post) {
    throw handleNotFoundError("Post");
  }

  if (post.endDate <= new Date()) {
    throw handleValidationError("Cannot apply to expired post");
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
      select: { fcm_token: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: post.userId },
      select: { fcm_token: true },
    }),
  ]);

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
            },
          },
          status: true,
          content: true,
        },
        where: {
          userId: req.userId,
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
            userImages: {
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
    user: {
      ...app.user,
      overallRating: ratingMap.get(app.user.id) || {
        averageRating: 0,
        totalRatings: 0,
        alreadyrated: false,
      },
    },
  }));

  res.status(200).json({
    success: true,
    message: "Post applications retrieved successfully",
    data: {
      list: listWithRatings,
      totalPages: Math.ceil(total / pageSize),
      currentPage: pageNumber,
      totalApplications: total,
    },
  });
});

export const updateUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body;

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
      data: { status },
      include: {
        post: {
          select: { title: true }
        },
        user: {
          select: { email: true, name: true, fcm_token: true }
        }
      }
    });

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

    const [postCount, posts, postApplicationsCount] = await Promise.all([
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
        },
        where: {
          userId: req.userId,
          is_active: true,
          endDate: dateFilter,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.postApplied.groupBy({
        by: ["status"],
        where: {
          post: {
            userId: req.userId,
            is_active: true,
            endDate: dateFilter,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

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
            paymentDate: true,
            responsibility: true,
            company_name: true,
            girls: true,
            boys: true,
            lunch: true,
            is_active: true,
            startDate: true,
            endDate: true,
            category: true,
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

    // Get all active posts with coordinates
    const allPosts = await prisma.post.findMany({
      where: {
        endDate: { gt: new Date() },
        is_active: true,
        latitude: { not: null },
        longitude: { not: null },
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
        paymentDate: true,
        responsibility: true,
        company_name: true,
        girls: true,
        boys: true,
        lunch: true,
        is_active: true,
        startDate: true,
        endDate: true,
        category: true,
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
