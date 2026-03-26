import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import {
    handleControllerError,
    handleNotFoundError,
    handleValidationError,
    handleForbiddenError,
    asyncHandler,
} from "../utils/errorHandler";
import { queueRatingNotification, queueLowRatingWarning } from "../queues/notificationQueue";

const prisma = new PrismaClient();

/**
 * Create a rating for a user after job completion
 * Only the recruiter who owns the post can rate applicants
 */
export const createRating = asyncHandler(async (req: Request, res: Response) => {
    const postId = req.params.postId as string;
    const userId = req.params.userId as string;
    const { rating, comment } = req.body;
    const recruiterId = req.userId;

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
    if (user?.fcm_token) {
        await queueRatingNotification({
            userId: userId as string,
            postTitle: post.title,
            rating: Number(rating),
            recruiterName: recruiter?.name || "A recruiter",
            fcmToken: user.fcm_token,
        });
    }

    // Check if user has received more than 5 1-star ratings in the last 30 days
    if (Number(rating) === 1) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oneStarCount = await prisma.rating.count({
            where: {
                userId,
                rating: 1,
                createdAt: {
                    gte: thirtyDaysAgo,
                },
            },
        });

        if (oneStarCount > 5) {
            // Store user id on FlaggedUser table
            await prisma.flaggedUser.create({
                data: {
                    userId,
                    reason: `Received ${oneStarCount} 1-star ratings in the last 30 days`,
                },
            });

            // Fetch user info for warning notification (need email and name)
            const fullUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, name: true, fcm_token: true },
            });

            if (fullUser && fullUser.email) {
                // Queue warning notification (FCM + Email)
                await queueLowRatingWarning({
                    userId,
                    userName: fullUser.name || "User",
                    userEmail: fullUser.email,
                    fcmToken: fullUser.fcm_token || undefined,
                });
            }
        }
    }

    res.status(201).json({
        success: true,
        message: "Rating submitted successfully",
        data: newRating,
    });
});

/**
 * Get all ratings for a user
 */
export const getUserRatings = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
        throw handleValidationError("User ID is required");
    }

    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
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

    res.status(200).json({
        success: true,
        message: "User ratings fetched successfully",
        data: {
            ratings,
            totalPages: Math.ceil(total / pageSize),
            currentPage: pageNumber,
            totalRatings: total,
        },
    });
});

/**
 * Get average rating for a user
 */
export const getAverageRating = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    if (!userId) {
        throw handleValidationError("User ID is required");
    }

    const result = await prisma.rating.aggregate({
        where: { userId },
        _avg: { rating: true },
        _count: { rating: true },
    });

    res.status(200).json({
        success: true,
        message: "Average rating fetched successfully",
        data: {
            averageRating: result._avg?.rating ? Number(result._avg.rating.toFixed(1)) : 0,
            totalRatings: result._count ?? 0,
        },
    });
});

/**
 * Get ratings given by a recruiter for a specific job
 */
export const getJobRatings = asyncHandler(async (req: Request, res: Response) => {
    const postId = req.params.postId as string;

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

    if (post.userId !== req.userId) {
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

    res.status(200).json({
        success: true,
        message: "Job ratings fetched successfully",
        data: ratings,
    });
});
