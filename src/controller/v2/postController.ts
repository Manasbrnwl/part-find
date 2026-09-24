import { Request, Response } from "express";
import { PostApprovalStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/errorHandler";

/**
 * GET /api/v2/post/get-all
 *
 * Version 2 of the candidate job feed. Same filters, paging and per-post
 * fields as v1 (/api/v1/post/get-all), plus:
 *   - `state`, the event's state
 *   - `recruiter`, the post owner's public profile (company, logo, type,
 *     address) with their average rating from past events
 *
 * Contact details (email / phone) are deliberately not included: candidates
 * reach a recruiter through chat once approved, so the feed can't be scraped
 * for contacts. v1 is untouched for older app builds.
 */
export const getAllPostsV2 = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10, page = 1 } = req.query;
  const typeId = req.query.type_id ? parseInt(req.query.type_id as string, 10) : undefined;
  const state = (req.query.state as string | undefined)?.trim();

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
    ...(state ? { state } : {}),
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
        state: true,
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
        user: {
          select: {
            id: true,
            name: true,
            recruiter_company_name: true,
            recruiter_company_logo: true,
            recruiter_type: true,
            recruiter_company_address: true,
            createdAt: true,
          },
        },
        _count: {
          select: { comments: true },
        },
        comments: {
          select: { id: true, status: true },
          where: { userId: req.userId },
        },
        savePosts: {
          select: { id: true },
          where: { userId: req.userId },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.post.count({ where: feedWhere }),
  ]);

  // Average rating per recruiter on this page, in one query.
  const recruiterIds = [...new Set(posts.map((p) => p.userId))];
  const ratingRows = recruiterIds.length
    ? await prisma.recruiterRating.groupBy({
        by: ["recruiterId"],
        where: { recruiterId: { in: recruiterIds } },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];
  const ratingByRecruiter = new Map(
    ratingRows.map((r) => [
      r.recruiterId,
      {
        average: r._avg.rating !== null ? Math.round(r._avg.rating * 10) / 10 : null,
        count: r._count._all,
      },
    ])
  );

  const postsWithFlag = posts.map(({ comments, _count, savePosts, user, ...rest }) => {
    const rating = ratingByRecruiter.get(rest.userId);
    return {
      ...rest,
      appliedFlag: comments.length > 0 ? 1 : 0,
      appliedStatus: comments?.[0]?.status || "Not Applied",
      appliedApplicants: _count.comments,
      savedFlag: savePosts.length > 0 ? 1 : 0,
      recruiter: user
        ? {
            id: user.id,
            name: user.name,
            companyName: user.recruiter_company_name,
            companyLogo: user.recruiter_company_logo,
            companyType: user.recruiter_type,
            companyAddress: user.recruiter_company_address,
            memberSince: user.createdAt,
            // what a candidate is really asking: is this recruiter any good?
            averageRating: rating?.average ?? null,
            ratingCount: rating?.count ?? 0,
          }
        : null,
    };
  });

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
