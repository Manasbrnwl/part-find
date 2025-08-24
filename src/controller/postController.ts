import express from "express";
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const router = express.Router();
const prisma = new PrismaClient();

export const createPosts = async (req: Request, res: Response) => {
  const { title, content, requirement, total, startDate, endDate, location, responsibility, designation, payment, paymentDate } =
    req.body;
  const userId = req.userId;
  try {
    const post = await prisma.post.create({
      data: {
        userId: userId || "0",
        title: title || "Untitled",
        content: content || "No content",
        role: designation || "No designation",
        requirement: requirement || "No requirement",
        total: Number(total),
        endDate: new Date(endDate),
        location: location || "No location",
        responsibility: responsibility || "No responsibility",
        startDate: new Date(startDate),
        payment: payment || "No payment",
        paymentDate: new Date(paymentDate)
      }
    });
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updatePost = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, content, requirement, total, endDate, startDate, location, responsibility, designation, payment, paymentDate } = req.body;

  try {
    const post = await prisma.post.findUnique({
      where: {
        id
      }
    });
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    if (post.userId !== req.userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const updatePost = await prisma.post.update({
      where: {
        id
      },
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
        payment: Number(payment) || post.payment
      }
    });
    res.status(201).json(updatePost);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deletePost = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const post = await prisma.post.findUnique({
      where: {
        id
      }
    });
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    if (post.userId !== req.userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    await prisma.post.delete({
      where: {
        id
      }
    });
    res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllPosts = async (req: Request, res: Response) => {
  try {
    const location = req.query.location as string;

    const posts = await prisma.post.findMany({
      where: {
        userId: req.userId,
        endDate: {
          gt: new Date()
        },
        // OR: [{ location: { contains: location } }]
      }
    });
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getPostById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const post = await prisma.post.findUnique({
      where: {
        id,
        userId: req.userId
      }
    });
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
