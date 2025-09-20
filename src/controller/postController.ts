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

const router = express.Router();
const prisma = new PrismaClient();

export const createPosts = asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    content,
    requirement,
    total,
    startDate,
    endDate,
    location,
    responsibility,
    designation,
    payment,
    paymentDate,
    company_name,
    categories,
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

  res.status(201).json({
    success: true,
    message: "Post created successfully",
    data: post,
  });
});

export const updatePost = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
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
    },
  });

  res.status(200).json({
    success: true,
    message: "Post updated successfully",
    data: updatedPost,
  });
});

export const deletePost = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

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
        is_active: true,
        startDate: true,
        endDate: true,
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
  const { id } = req.params;

  if (!id) {
    throw handleValidationError("Post ID is required");
  }

  const post = await prisma.post.findUnique({
    where: {
      id,
      userId: req.userId,
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
  const { id } = req.params;
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

  const application = await prisma.postApplied.create({
    data: {
      userId,
      postId: id,
      content: req.body.content || "",
    },
  });

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
  const { id } = req.params;

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

  res.status(200).json({
    success: true,
    message: "Post applications retrieved successfully",
    data: {
      list,
      totalPages: Math.ceil(total / pageSize),
      currentPage: pageNumber,
      totalApplications: total,
    },
  });
});

export const updateUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
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
      include: {
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
    });

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
  const { postId } = req.params;

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
            is_active: true,
            startDate: true,
            endDate: true,
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
