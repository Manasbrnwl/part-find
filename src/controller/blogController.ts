import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler, handleNotFoundError } from "../utils/errorHandler";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

/**
 * Get all active blogs (Public)
 */
export const getAllBlogs = asyncHandler(async (req: Request, res: Response) => {
  const blogs = await prisma.blog.findMany({
    where: { is_active: true },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    data: blogs,
  });
});

/**
 * Get all blogs including inactive (Admin)
 */
export const getAdminBlogs = asyncHandler(async (req: Request, res: Response) => {
  const blogs = await prisma.blog.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    data: blogs,
  });
});

/**
 * Get single blog by ID
 */
export const getBlogById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const blog = await prisma.blog.findFirst({
    where: { id, is_active: true },
  });

  if (!blog) {
    throw handleNotFoundError("Blog");
  }

  res.status(200).json({
    success: true,
    data: blog,
  });
});

/**
 * Create a new blog (Admin)
 */
export const createBlog = asyncHandler(async (req: Request, res: Response) => {
  const { title, content, image, author } = req.body;

  if (!title || !content) {
    return res.status(400).json({
      success: false,
      error: "Title and content are required fields",
    });
  }

  const blog = await prisma.blog.create({
    data: {
      title,
      content,
      image: image || null,
      author: author || "Admin",
    },
  });

  logger.info(`Blog created successfully: ${blog.id}`);

  res.status(201).json({
    success: true,
    data: blog,
    message: "Blog created successfully",
  });
});

/**
 * Update a blog (Admin)
 */
export const updateBlog = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { title, content, image, author, is_active } = req.body;

  const existing = await prisma.blog.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Blog");
  }

  const blog = await prisma.blog.update({
    where: { id },
    data: {
      title: title !== undefined ? title : existing.title,
      content: content !== undefined ? content : existing.content,
      image: image !== undefined ? image : existing.image,
      author: author !== undefined ? author : existing.author,
      is_active: is_active !== undefined ? is_active : existing.is_active,
    },
  });

  logger.info(`Blog updated successfully: ${blog.id}`);

  res.status(200).json({
    success: true,
    data: blog,
    message: "Blog updated successfully",
  });
});

/**
 * Delete a blog (Admin)
 */
export const deleteBlog = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const existing = await prisma.blog.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Blog");
  }

  await prisma.blog.delete({
    where: { id },
  });

  logger.info(`Blog deleted: ${id}`);

  res.status(200).json({
    success: true,
    message: "Blog deleted successfully",
  });
});
