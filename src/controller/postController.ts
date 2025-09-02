import express from "express";
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { threadCpuUsage } from "node:process";

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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const getAllPosts = async (req: Request, res: Response) => {
  try {
    const location = req.query.location as string;

    const posts = await prisma.post.findMany({
      where: {
        endDate: {
          gt: new Date()
        },
        // OR: [{ location: { contains: location } }]
      }
    });
    res.status(200).json(posts);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const applyToPost = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
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
    if (typeof userId === 'string') {
      await prisma.postApplied.create({
        data: {
          userId,
          postId: id,
          content: req.body.content,
        },
      });
    }
    res.status(200).json({ message: "Applied to post" });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const getAppliedPosts = async (req: Request, res: Response) => {
  try {
    const posts = await prisma.postApplied.findMany({
      select: {
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            total: true,
            location: true,
            role: true,
            endDate: true
          }
        },
        status: true,
        content: true,
      },
      where: {
        userId: req.userId
      },
      orderBy: {
        post: {
          endDate: 'desc'
        }
      }
    });
    res.status(200).json(posts.map((post) => ({
      ...post.post,
      status: post.post.endDate > new Date() ? post.status : "closed",
      content: post.content,
    })));
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const listPosts = async (req: Request, res: Response) => {
  const valid = await prisma.post.findFirst({
    where: {
      AND: [{ userId: req.userId },
      { id: req.params.id }]
    }
  })
  if (!valid) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  const { id } = req.params;
  try {
    const list = await prisma.postApplied.findMany({
      select: {
        id: true,
        status: true,
        content: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            date_of_birth: true,
            phone_number: true,
            role: true,
            height: true,
            weight: true,
            gender: true,
            english_level: true,
            address: true,
            state: true,
            country: true
          }
        }
      },
      where: {
        postId: id,
        user: {
          is: {
            is_active: true
          }
        }
      }
    });
    res.status(200).json(list);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

export const updateUserStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const list = await prisma.postApplied.update({
      where: {
        id
      },
      data: {
        status
      }
    });
    res.status(200).json(list);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

export const recruiterGetPost = async (req: Request, res: Response) => {
  try {
    const post = await prisma.post.findMany({ where: { userId: req.userId } })
    res.status(200).json(post);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}
