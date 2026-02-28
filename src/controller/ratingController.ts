import { Context } from "hono";
import {
    handleControllerError,
    handleNotFoundError,
    handleValidationError,
    handleForbiddenError,
} from "../utils/errorHandler";
import { getPrisma } from "../lib/prisma";

export const createRating = async (c: Context) => {
    try {
        const prisma = getPrisma(c.env);
        const postId = c.req.param("postId");
        const userId = c.req.param("userId");
        const body = await c.req.json();
        const { rating, comment } = body;
        const recruiterId = c.get("userId");

        if (!recruiterId) {
            throw handleValidationError("Recruiter ID is required");
        }

        if (!postId || !userId) {
            throw handleValidationError("Post ID and User ID are required");
        }

        if (!rating || rating < 1 || rating > 5) {
            throw handleValidationError("Rating must be between 1 and 5");
        }

        // Verify the post exists and belongs to the recruiter
        const post = await prisma.post.findUnique({
            where: { id: postId },
            select: {
                id: true,
                userId: true,
                title: true,
                endDate: true,
                is_active: true,
            },
        });

        if (!post) {
            throw handleNotFoundError("Post");
        }

        if (post.userId !== recruiterId) {
            throw handleForbiddenError("You can only rate applicants for your own posts");
        }

        // Check if the job is completed (endDate has passed)
        if (post.endDate > new Date()) {
            throw handleValidationError("You can only rate users after the job is completed");
        }

        // Verify the user applied to this post and was approved
        const application = await prisma.postApplied.findFirst({
            where: {
                postId,
                userId,
                status: "APPROVED",
            },
        });

        if (!application) {
            throw handleValidationError("User must be an approved applicant for this job");
        }

        // Check if rating already exists
        const existingRating = await prisma.rating.findUnique({
            where: {
                postId_userId: { postId, userId },
            },
        });

        if (existingRating) {
            throw handleValidationError("You have already rated this user for this job");
        }

        // Get recruiter and user details for notification
        const [recruiter, user] = await Promise.all([
            prisma.user.findUnique({
                where: { id: recruiterId },
                select: { name: true },
            }),
            prisma.user.findUnique({
                where: { id: userId },
                select: { fcm_token: true },
            }),
        ]);

        // Create the rating
        const newRating = await prisma.rating.create({
            data: {
                postId,
                recruiterId,
                userId,
                rating: Number(rating),
                comment: comment || null,
            },
        });

        // Queue notification for the user
        // Removed legacy background job notification queue. Add Cloudflare Queues integration here later if required.

        return c.json({
            success: true,
            message: "Rating submitted successfully",
            data: newRating,
        }, 201);
    } catch (error) {
        return handleControllerError(error, c);
    }
};

export const getUserRatings = async (c: Context) => {
    try {
        const prisma = getPrisma(c.env);
        const userId = c.req.param("userId");
        const { page = "1", limit = "10" } = c.req.query();

        if (!userId) {
            throw handleValidationError("User ID is required");
        }

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
        const skip = (pageNumber - 1) * pageSize;

        const [ratings, total] = await Promise.all([
            prisma.rating.findMany({
                where: { userId },
                include: {
                    post: {
                        select: {
                            id: true,
                            title: true,
                            company_name: true,
                        },
                    },
                    recruiter: {
                        select: {
                            id: true,
                            name: true,
                            recruiter_company_name: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: pageSize,
            }),
            prisma.rating.count({ where: { userId } }),
        ]);

        return c.json({
            success: true,
            message: "User ratings fetched successfully",
            data: {
                ratings,
                totalPages: Math.ceil(total / pageSize),
                currentPage: pageNumber,
                totalRatings: total,
            },
        });
    } catch (error) {
        return handleControllerError(error, c);
    }
};

export const getAverageRating = async (c: Context) => {
    try {
        const prisma = getPrisma(c.env);
        const userId = c.req.param("userId");

        if (!userId) {
            throw handleValidationError("User ID is required");
        }

        const result = await prisma.rating.aggregate({
            where: { userId },
            _avg: { rating: true },
            _count: { rating: true },
        });

        return c.json({
            success: true,
            message: "Average rating fetched successfully",
            data: {
                averageRating: result._avg?.rating ? Number(result._avg.rating.toFixed(1)) : 0,
                totalRatings: result._count ?? 0,
            },
        });
    } catch (error) {
        return handleControllerError(error, c);
    }
};

export const getJobRatings = async (c: Context) => {
    try {
        const prisma = getPrisma(c.env);
        const postId = c.req.param("postId");
        const userId = c.get("userId");

        if (!postId) {
            throw handleValidationError("Post ID is required");
        }

        // Verify post exists and belongs to the current user
        const post = await prisma.post.findUnique({
            where: { id: postId },
            select: { userId: true },
        });

        if (!post) {
            throw handleNotFoundError("Post");
        }

        if (post.userId !== userId) {
            throw handleForbiddenError("You can only view ratings for your own posts");
        }

        const ratings = await prisma.rating.findMany({
            where: { postId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        userImages: {
                            select: { image: true },
                            take: 1,
                        },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return c.json({
            success: true,
            message: "Job ratings fetched successfully",
            data: ratings,
        });
    } catch (error) {
        return handleControllerError(error, c);
    }
};
