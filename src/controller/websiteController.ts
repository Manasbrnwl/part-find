import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler, handleNotFoundError } from "../utils/errorHandler";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

// --- CLIENTS / PARTNERS ---

/**
 * Get all clients
 */
export const getClients = asyncHandler(async (req: Request, res: Response) => {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    data: clients,
  });
});

/**
 * Create a client
 */
export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const { name, logo, description } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: "Name is a required field",
    });
  }

  const client = await prisma.client.create({
    data: {
      name,
      logo: logo || null,
      description: description || null,
    },
  });

  logger.info(`Client created successfully: ${client.id}`);

  res.status(201).json({
    success: true,
    data: client,
    message: "Client created successfully",
  });
});

/**
 * Update a client
 */
export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, logo, description } = req.body;

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Client");
  }

  const client = await prisma.client.update({
    where: { id },
    data: {
      name: name !== undefined ? name : existing.name,
      logo: logo !== undefined ? logo : existing.logo,
      description: description !== undefined ? description : existing.description,
    },
  });

  logger.info(`Client updated successfully: ${client.id}`);

  res.status(200).json({
    success: true,
    data: client,
    message: "Client updated successfully",
  });
});

/**
 * Delete a client
 */
export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Client");
  }

  await prisma.client.delete({
    where: { id },
  });

  logger.info(`Client deleted: ${id}`);

  res.status(200).json({
    success: true,
    message: "Client deleted successfully",
  });
});

// --- TESTIMONIALS ---

/**
 * Get all testimonials
 */
export const getTestimonials = asyncHandler(async (req: Request, res: Response) => {
  const testimonials = await prisma.testimonial.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    data: testimonials,
  });
});

/**
 * Create a testimonial
 */
export const createTestimonial = asyncHandler(async (req: Request, res: Response) => {
  const { name, role, avatar, rating, text } = req.body;

  if (!name || !text) {
    return res.status(400).json({
      success: false,
      error: "Name and text are required fields",
    });
  }

  const testimonial = await prisma.testimonial.create({
    data: {
      name,
      role: role || null,
      avatar: avatar || null,
      rating: rating !== undefined ? Number(rating) : 5,
      text,
    },
  });

  logger.info(`Testimonial created successfully: ${testimonial.id}`);

  res.status(201).json({
    success: true,
    data: testimonial,
    message: "Testimonial created successfully",
  });
});

/**
 * Update a testimonial
 */
export const updateTestimonial = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, role, avatar, rating, text } = req.body;

  const existing = await prisma.testimonial.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Testimonial");
  }

  const testimonial = await prisma.testimonial.update({
    where: { id },
    data: {
      name: name !== undefined ? name : existing.name,
      role: role !== undefined ? role : existing.role,
      avatar: avatar !== undefined ? avatar : existing.avatar,
      rating: rating !== undefined ? Number(rating) : existing.rating,
      text: text !== undefined ? text : existing.text,
    },
  });

  logger.info(`Testimonial updated successfully: ${testimonial.id}`);

  res.status(200).json({
    success: true,
    data: testimonial,
    message: "Testimonial updated successfully",
  });
});

/**
 * Delete a testimonial
 */
export const deleteTestimonial = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const existing = await prisma.testimonial.findUnique({ where: { id } });
  if (!existing) {
    throw handleNotFoundError("Testimonial");
  }

  await prisma.testimonial.delete({
    where: { id },
  });

  logger.info(`Testimonial deleted: ${id}`);

  res.status(200).json({
    success: true,
    message: "Testimonial deleted successfully",
  });
});
