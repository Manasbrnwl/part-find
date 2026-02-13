import { Context } from "hono";
import { Status } from "@prisma/client";
import {
  handleControllerError,
  handleNotFoundError,
  handleForbiddenError,
  handleValidationError,
} from "../utils/errorHandler";
import { scheduleJobReminder } from "../queues/notificationQueue";
import { getPrisma } from "../lib/prisma";

export const createPosts = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const body = await c.req.json();

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
      latitude,
      longitude,
    } = body;

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

    return c.json({
      success: true,
      message: "Post created successfully",
      data: post,
    }, 201);
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const updatePost = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const id = c.req.param("id");
    const userId = c.get("userId");
    const body = await c.req.json();

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
      latitude,
      longitude,
    } = body;

    if (!id) {
      throw handleValidationError("Post ID is required");
    }

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      throw handleNotFoundError("Post");
    }

    if (post.userId !== userId) {
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
        girls,
        boys,
        lunch,
        latitude: latitude !== undefined ? parseFloat(latitude) : post.latitude,
        longitude: longitude !== undefined ? parseFloat(longitude) : post.longitude,
      },
    });

    return c.json({
      success: true,
      message: "Post updated successfully",
      data: updatedPost,
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const deletePost = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const id = c.req.param("id");
    const userId = c.get("userId");

    if (!id) {
      throw handleValidationError("Post ID is required");
    }

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      throw handleNotFoundError("Post");
    }

    if (post.userId !== userId) {
      throw handleForbiddenError("You don't have permission to delete this post");
    }

    await prisma.post.update({
      data: { is_active: false },
      where: { id },
    });

    return c.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const getAllPosts = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const { limit = "10", page = "1" } = c.req.query();

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
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
              userId: userId,
            },
          },
          savePosts: {
            select: {
              id: true,
            },
            where: {
              userId: userId,
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

    return c.json({
      success: true,
      message: "Posts retrieved successfully",
      data: {
        posts: postsWithFlag,
        totalPages: Math.ceil(total / pageSize),
        currentPage: pageNumber,
        totalPosts: total,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const getPostById = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const id = c.req.param("id");
    const userId = c.get("userId");

    if (!id) {
      throw handleValidationError("Post ID is required");
    }

    const post = await prisma.post.findUnique({
      where: {
        id,
        userId: userId,
        is_active: true,
      },
    });

    if (!post) {
      throw handleNotFoundError("Post");
    }

    return c.json({
      success: true,
      message: "Post retrieved successfully",
      data: post,
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const applyToPost = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const id = c.req.param("id");
    const userId = c.get("userId");
    const body = await c.req.json();

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

    // Get user's FCM token for scheduling notification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcm_token: true },
    });

    const application = await prisma.postApplied.create({
      data: {
        userId,
        postId: id,
        content: body.content || "",
      },
    });

    // Schedule job reminder notification for 1 day before start
    if (user?.fcm_token) {
      await scheduleJobReminder({
        userId,
        postId: id,
        postTitle: post.title,
        startDate: post.startDate,
        location: post.location || "TBD",
        fcmToken: user.fcm_token,
      });
    }

    return c.json({
      success: true,
      message: "Successfully applied to post",
      data: application,
    }, 201);
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const getAppliedPosts = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const { limit = "10", page = "1" } = c.req.query();

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
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
          userId: userId,
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
          userId: userId,
        },
      }),
    ]);

    return c.json({
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
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const listPosts = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const id = c.req.param("id");
    const userId = c.get("userId");

    if (!id) {
      throw handleValidationError("Post ID is required");
    }

    const valid = await prisma.post.findFirst({
      where: {
        AND: [{ userId: userId }, { id: id }],
      },
    });

    if (!valid) {
      throw handleForbiddenError(
        "You don't have permission to view applications for this post"
      );
    }

    const { filter, page = "1", limit = "10" } = c.req.query();
    const statusFilter: Status =
      typeof filter === "string" ? (filter as Status) : Status.PENDING;

    // pagination numbers
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
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

    return c.json({
      success: true,
      message: "Post applications retrieved successfully",
      data: {
        list,
        totalPages: Math.ceil(total / pageSize),
        currentPage: pageNumber,
        totalApplications: total,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const updateUserStatus = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const id = c.req.param("id");
    const userId = c.get("userId");
    const { status } = await c.req.json();

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

    if (application.post.userId !== userId) {
      throw handleForbiddenError(
        "You don't have permission to update this application status"
      );
    }

    const updatedApplication = await prisma.postApplied.update({
      where: { id },
      data: { status },
    });

    return c.json({
      success: true,
      message: "Application status updated successfully",
      data: updatedApplication,
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const recruiterGetPost = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const { filter } = c.req.query();

    const dateFilter =
      filter === "COMPLETED"
        ? { lt: new Date() } // completed = endDate in past
        : { gt: new Date() }; // not completed = endDate in future

    const [postCount, posts, postApplicationsCount] = await Promise.all([
      prisma.post.count({
        where: {
          userId: userId,
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
          userId: userId,
          is_active: true,
          endDate: dateFilter,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.postApplied.groupBy({
        by: ["status"],
        where: {
          post: {
            userId: userId,
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

    return c.json({
      success: true,
      message: "Recruiter posts retrieved successfully",
      data: {
        posts: postsWithCount,
        dashboard: postApplicationsCount,
        count: postCount,
      },
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const savePost = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const postId = c.req.param("postId");
    const userId = c.get("userId");

    if (!postId) {
      throw handleValidationError("Post ID is required");
    }

    if (!userId) {
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
        userId: userId,
        postId: postId,
      },
    });

    if (existingSave) {
      throw handleValidationError("Post is already saved");
    }

    const savedPost = await prisma.savePosts.create({
      data: {
        userId: userId,
        postId: postId,
      },
    });

    return c.json({
      success: true,
      message: "Post saved successfully",
      data: savedPost,
    }, 201);
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const getSavePosts = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");

    const saved = await prisma.savePosts.findMany({
      where: {
        userId: userId,
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
                userId: userId,
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

    return c.json({
      success: true,
      message: "Saved posts retrieved successfully",
      data: savedPosts,
    });
  } catch (error) {
    return handleControllerError(error, c);
  }
};

export const getNearbyPosts = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const userId = c.get("userId");
    const { lat, long, radius = "10", limit = "20", page = "1" } = c.req.query();

    if (!lat || !long) {
      throw handleValidationError("Latitude and longitude are required");
    }

    const userLat = parseFloat(lat);
    const userLong = parseFloat(long);
    const radiusKm = parseFloat(radius) || 10;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 20, 1);

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
            userId: userId,
          },
        },
        savePosts: {
          select: {
            id: true,
          },
          where: {
            userId: userId,
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

    return c.json({
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
  } catch (error) {
    return handleControllerError(error, c);
  }
};
