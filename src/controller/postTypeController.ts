import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  asyncHandler,
  handleNotFoundError,
  handleValidationError,
} from "../utils/errorHandler";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

/**
 * GET /post/types
 * List post/employment types. By default only active types are returned (for the
 * app's create-post dropdown and feed filter). Admin can pass ?all=true to also
 * get inactive ones for management.
 */
export const getPostTypes = asyncHandler(async (req: Request, res: Response) => {
  const includeInactive = req.query.all === "true";

  const types = await prisma.postType.findMany({
    where: includeInactive ? {} : { is_active: true },
    orderBy: { name: "asc" },
  });

  res.status(200).json({
    success: true,
    message: "Post types retrieved successfully",
    data: types,
  });
});

/**
 * POST /admin/post-types  (Admin)
 * Create a new post type. Body: { name, description? }
 */
export const createPostType = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body;

  if (!name || !String(name).trim()) {
    throw handleValidationError("Type name is required");
  }

  const cleanName = String(name).trim();

  const existing = await prisma.postType.findUnique({ where: { name: cleanName } });
  if (existing) {
    throw handleValidationError("A post type with this name already exists");
  }

  const type = await prisma.postType.create({
    data: {
      name: cleanName,
      description: description ? String(description).trim() : null,
    },
  });

  logger.info(`Admin created post type "${cleanName}" (${type.id})`);

  res.status(201).json({
    success: true,
    message: "Post type created successfully",
    data: type,
  });
});

/**
 * PATCH /admin/post-types/:id  (Admin)
 * Update a post type. Body: { name?, description?, is_active? }
 */
export const updatePostType = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { name, description, is_active } = req.body;

  if (!id || Number.isNaN(id)) {
    throw handleValidationError("A valid post type ID is required");
  }

  const type = await prisma.postType.findUnique({ where: { id } });
  if (!type) {
    throw handleNotFoundError("Post type");
  }

  // If renaming, guard the unique constraint against other rows.
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (!cleanName) {
      throw handleValidationError("Type name cannot be empty");
    }
    const clash = await prisma.postType.findFirst({
      where: { name: cleanName, id: { not: id } },
    });
    if (clash) {
      throw handleValidationError("Another post type with this name already exists");
    }
  }

  const updated = await prisma.postType.update({
    where: { id },
    data: {
      name: name !== undefined ? String(name).trim() : undefined,
      description:
        description !== undefined
          ? description
            ? String(description).trim()
            : null
          : undefined,
      is_active: typeof is_active === "boolean" ? is_active : undefined,
    },
  });

  logger.info(`Admin updated post type ${id}`);

  res.status(200).json({
    success: true,
    message: "Post type updated successfully",
    data: updated,
  });
});

/**
 * DELETE /admin/post-types/:id  (Admin)
 * Soft-delete by deactivating the type (keeps historical posts' type intact).
 * Pass ?hard=true to permanently delete (only allowed when no post uses it).
 */
export const deletePostType = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);

  if (!id || Number.isNaN(id)) {
    throw handleValidationError("A valid post type ID is required");
  }

  const type = await prisma.postType.findUnique({ where: { id } });
  if (!type) {
    throw handleNotFoundError("Post type");
  }

  if (req.query.hard === "true") {
    const inUse = await prisma.post.count({ where: { type_id: id } });
    if (inUse > 0) {
      throw handleValidationError(
        `Cannot delete: ${inUse} post(s) use this type. Deactivate it instead.`
      );
    }
    await prisma.postType.delete({ where: { id } });
    logger.info(`Admin hard-deleted post type ${id}`);
    return res.status(200).json({
      success: true,
      message: "Post type deleted permanently",
    });
  }

  const updated = await prisma.postType.update({
    where: { id },
    data: { is_active: false },
  });

  logger.info(`Admin deactivated post type ${id}`);

  res.status(200).json({
    success: true,
    message: "Post type deactivated successfully",
    data: updated,
  });
});
