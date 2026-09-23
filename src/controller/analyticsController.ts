import { Request, Response } from "express";
import { PostApprovalStatus, Role, Status } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/errorHandler";

/**
 * GET /admin/analytics?days=7
 *
 * One call powering the admin dashboard. Everything is reported for the
 * selected window (default 7 days) *and* for the window immediately before it,
 * so the UI can show whether each number is up or down. A few platform totals
 * (all-time) and "needs attention" counts ride along.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_DAYS = [7, 30, 90];

/** Local-midnight boundary so daily buckets line up with calendar days. */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "new", no baseline
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Group rows into per-calendar-day counts across the whole window. */
function bucketByDay(rows: { createdAt: Date }[], from: Date, days: number) {
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * DAY_MS);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = startOfDay(r.createdAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const requested = parseInt((req.query.days as string) || "7", 10);
  const days = ALLOWED_DAYS.includes(requested) ? requested : 7;

  const now = new Date();
  // Inclusive window: the last `days` calendar days, ending today.
  const from = startOfDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  const prevTo = from;

  const inWindow = { gte: from };
  const inPrev = { gte: prevFrom, lt: prevTo };

  const [
    // ── people ──
    usersByRole,
    prevUsersByRole,
    signupRows,
    activeUsers,
    referralSignups,
    // ── posts ──
    postsCreated,
    prevPostsCreated,
    postRows,
    postsLive,
    postsCompleted,
    postsPendingApproval,
    // ── applications ──
    appsByStatus,
    prevAppsTotal,
    appRows,
    attendedCount,
    // ── platform totals (all-time) ──
    totalUsersByRole,
    totalPosts,
    totalApplications,
    certificatesIssued,
    // ── needs attention ──
    flaggedPending,
    // ── engagement ──
    chatThreads,
    chatMessages,
    topPosts,
    topRecruiters,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { createdAt: inWindow }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ["role"], where: { createdAt: inPrev }, _count: { _all: true } }),
    prisma.user.findMany({ where: { createdAt: inWindow }, select: { createdAt: true, role: true } }),
    prisma.user.count({ where: { last_active_at: inWindow } }),
    prisma.user.count({ where: { createdAt: inWindow, referred_by_code: { not: null } } }),

    prisma.post.count({ where: { createdAt: inWindow } }),
    prisma.post.count({ where: { createdAt: inPrev } }),
    prisma.post.findMany({ where: { createdAt: inWindow }, select: { createdAt: true } }),
    // "live" = approved, active, still running
    prisma.post.count({
      where: { approval_status: PostApprovalStatus.APPROVED, is_active: true, endDate: { gte: now } },
    }),
    prisma.post.count({ where: { approval_status: PostApprovalStatus.APPROVED, endDate: { lt: now } } }),
    prisma.post.count({ where: { approval_status: PostApprovalStatus.PENDING } }),

    prisma.postApplied.groupBy({ by: ["status"], where: { createdAt: inWindow }, _count: { _all: true } }),
    prisma.postApplied.count({ where: { createdAt: inPrev } }),
    prisma.postApplied.findMany({ where: { createdAt: inWindow }, select: { createdAt: true } }),
    prisma.postApplied.count({ where: { createdAt: inWindow, attended: true } }),

    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.post.count(),
    prisma.postApplied.count(),
    prisma.certificate.count({ where: { issuedAt: inWindow } }),

    prisma.postReport.count({ where: { status: "PENDING" } }),

    prisma.chatThread.count({ where: { createdAt: inWindow } }),
    prisma.chatMessage.count({ where: { createdAt: inWindow } }),

    // most-applied posts created in the window
    prisma.post.findMany({
      where: { createdAt: inWindow },
      select: {
        id: true,
        title: true,
        company_name: true,
        total: true,
        endDate: true,
        user: { select: { name: true, recruiter_company_name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { comments: { _count: "desc" } },
      take: 5,
    }),
    // busiest recruiters in the window
    prisma.post.groupBy({
      by: ["userId"],
      where: { createdAt: inWindow },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }),
  ]);

  const roleCount = (rows: { role: Role | null; _count: { _all: number } }[], role: Role) =>
    rows.find((r) => r.role === role)?._count._all ?? 0;

  const statusCount = (rows: { status: Status | null; _count: { _all: number } }[], status: Status) =>
    rows.find((r) => r.status === status)?._count._all ?? 0;

  const newUsers = roleCount(usersByRole, Role.USER);
  const newRecruiters = roleCount(usersByRole, Role.RECRUITER) + roleCount(usersByRole, Role.SERVICE_SEEKER);
  const prevNewUsers = roleCount(prevUsersByRole, Role.USER);
  const prevNewRecruiters =
    roleCount(prevUsersByRole, Role.RECRUITER) + roleCount(prevUsersByRole, Role.SERVICE_SEEKER);

  const applications = {
    total: appsByStatus.reduce((sum, r) => sum + r._count._all, 0),
    pending: statusCount(appsByStatus, Status.PENDING),
    approved: statusCount(appsByStatus, Status.APPROVED),
    rejected: statusCount(appsByStatus, Status.REJECTED),
    withdrawn: statusCount(appsByStatus, Status.CANCELLED),
    notPresent: statusCount(appsByStatus, Status.NOT_PRESENT),
  };

  // name lookup for the busiest recruiters
  const recruiterIds = topRecruiters.map((r) => r.userId);
  const recruiterRows = recruiterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: recruiterIds } },
        select: { id: true, name: true, email: true, recruiter_company_name: true },
      })
    : [];

  const signupSeries = bucketByDay(signupRows, from, days);
  const userSignups = bucketByDay(signupRows.filter((r) => r.role === Role.USER), from, days);
  const recruiterSignups = bucketByDay(
    signupRows.filter((r) => r.role === Role.RECRUITER || r.role === Role.SERVICE_SEEKER),
    from,
    days
  );
  const postSeries = bucketByDay(postRows, from, days);
  const appSeries = bucketByDay(appRows, from, days);

  res.status(200).json({
    success: true,
    data: {
      window: { days, from, to: now },

      people: {
        newUsers,
        newRecruiters,
        newTotal: newUsers + newRecruiters,
        change: {
          users: pctChange(newUsers, prevNewUsers),
          recruiters: pctChange(newRecruiters, prevNewRecruiters),
        },
        activeUsers,
        referralSignups,
      },

      posts: {
        created: postsCreated,
        change: pctChange(postsCreated, prevPostsCreated),
        live: postsLive,
        completed: postsCompleted,
        pendingApproval: postsPendingApproval,
      },

      applications: {
        ...applications,
        change: pctChange(applications.total, prevAppsTotal),
        attended: attendedCount,
        // how many applicants an average post created in this window attracted
        perPost: postsCreated > 0 ? Math.round((applications.total / postsCreated) * 10) / 10 : 0,
        // share of decided applications that were accepted
        acceptanceRate:
          applications.approved + applications.rejected > 0
            ? Math.round((applications.approved / (applications.approved + applications.rejected)) * 1000) / 10
            : null,
      },

      engagement: {
        chatThreads,
        chatMessages,
        certificatesIssued,
      },

      needsAttention: {
        postsPendingApproval,
        flaggedPending,
        applicationsPending: applications.pending,
      },

      totals: {
        users: roleCount(totalUsersByRole, Role.USER),
        recruiters:
          roleCount(totalUsersByRole, Role.RECRUITER) + roleCount(totalUsersByRole, Role.SERVICE_SEEKER),
        posts: totalPosts,
        applications: totalApplications,
      },

      series: {
        signups: signupSeries,
        userSignups,
        recruiterSignups,
        posts: postSeries,
        applications: appSeries,
      },

      topPosts: topPosts.map((p) => ({
        id: p.id,
        title: p.title,
        company: p.company_name || p.user?.recruiter_company_name || p.user?.name || "—",
        applicants: p._count.comments,
        vacancies: p.total,
        isLive: p.endDate >= now,
      })),

      topRecruiters: topRecruiters.map((r) => {
        const u = recruiterRows.find((x) => x.id === r.userId);
        return {
          id: r.userId,
          name: u?.recruiter_company_name || u?.name || u?.email || "—",
          email: u?.email || "",
          posts: r._count._all,
        };
      }),
    },
  });
});
