import express from "express";
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const router = express.Router();
const prisma = new PrismaClient();

export const createPosts = async (req: Request, res: Response) => {
  const { title, content, requirement, total, endDate } = req.body;
  const userId = req.userId;
  try {
    const post = await prisma.post.create({
      data: {
        userId: userId || "0",
        title: title || "Untitled",
        content: content || "No content",
        requirement: requirement || "No requirement",
        total: Number(total),
        endDate: new Date(endDate)
      }
    });
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updatePost = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, content, requirement, total, endDate } = req.body;
  try {
    if (title || content || requirement || total || endDate) {
      res.status(400).json({ message: "Bad request" });
      return;
    }

    const post = await prisma.post.findUnique({
      where: {
        id
      }
    });
    if (!post) {
      res.status(404).json({ message: "Post not found" });
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
        endDate: new Date(endDate) || post.endDate
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
    const posts = await prisma.post.findMany({
      where: {
        userId: req.userId
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
