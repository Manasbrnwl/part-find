import { Request } from "express";

/**
 * Shared query-string pagination for list endpoints.
 *
 *   ?page=2&limit=25&search=foo
 *
 * `explicit` is true when the caller sent page/limit at all — endpoints that
 * are also consumed unpaginated (public website lists, post types used by the
 * mobile app) use it to keep returning the full list for legacy callers.
 */
export interface PageParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
  explicit: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const toInt = (raw: unknown, fallback: number) => {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const parsePagination = (
  req: Request,
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): PageParams => {
  const { defaultLimit = 20, maxLimit = 100 } = opts;
  const explicit = req.query.page !== undefined || req.query.limit !== undefined;
  const page = toInt(req.query.page, 1);
  const limit = Math.min(maxLimit, toInt(req.query.limit, defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit, explicit };
};

export const paginationMeta = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

/** Trimmed `?search=` term, or "" when absent. */
export const searchTerm = (req: Request): string =>
  String(req.query.search ?? "").trim();

/** Prisma case-insensitive `contains` filter for a string column. */
export const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
