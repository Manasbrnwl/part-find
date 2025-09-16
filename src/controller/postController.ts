import express from "express";
import { PrismaClient, Status } from "@prisma/client";
import { Request, Response } from "express";
import { threadCpuUsage } from "node:process";

const router = express.Router();
const prisma = new PrismaClient();

export const createPosts = async (req: Request, res: Response) => {
  const {
    title,
    content,
    requirement,
    total,
    startDate,
    endDate,
    location,
    responsibility,
    designation,
    payment,
    paymentDate
  } = req.body;
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
  const {
    title,
    content,
    requirement,
    total,
    endDate,
    startDate,
    location,
    responsibility,
    designation,
    payment,
    paymentDate
  } = req.body;

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
    await prisma.post.update({
      data: {
        is_active: false
      },
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
    const { limit = 10, page = 1 } = req.query;

    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize;
    const [posts, total] = await Promise.all([
      await prisma.post.findMany({
        where: {
          endDate: { gt: new Date() }
        },
        select: {
          id: true,
          userId: true,
          title: true,
          role: true,
          content: true,
          requirement: true,
          total: true,
          location: true,
          payment: true,
          paymentDate: true,
          responsibility: true,
          company_name: true,
          is_active: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { comments: true }
          },
          comments: {
            select: {
              id: true,
              status: true
            },
            where: {
              userId: req.userId
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.post.count({
        where: {
          endDate: {
            gt: new Date()
          }
        }
      })
    ]);

    const postsWithFlag = posts.map(({ comments, _count, ...rest }) => ({
      ...rest,
      appliedFlag: comments.length > 0 ? 1 : 0,
      appliedStatus: comments?.[0]?.status || "Not Applied",
      appliedApplicants: _count.comments
    }));
    res.status(200).json({
      posts: postsWithFlag.filter((post) => post.appliedFlag === 0),
      totalPages: Math.ceil(total / pageSize)
    });
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
    if (typeof userId === "string") {
      await prisma.postApplied.create({
        data: {
          userId,
          postId: id,
          content: req.body.content || ""
        }
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
    const { limit = 10, page = 1 } = req.query;

    const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize;
    const [posts, total] = await Promise.all([
      await prisma.postApplied.findMany({
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
          content: true
        },
        where: {
          userId: req.userId
        },
        orderBy: {
          post: {
            endDate: "desc"
          }
        },
        skip,
        take
      }),
      prisma.postApplied.count({
        where: {
          userId: req.userId
        }
      })
    ]);
    res.status(200).json({
      posts: posts.map((post) => ({
        ...post.post,
        status: post.post.endDate > new Date() ? post.status : "closed",
        content: post.content
      })),
      totalPages: Math.ceil(total / pageSize)
    });
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
      AND: [{ userId: req.userId }, { id: req.params.id }]
    }
  });
  if (!valid) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  const { id } = req.params;
  const { filter, page = "1", limit = "10" } = req.query;
  const statusFilter: Status =
    typeof filter === "string" ? (filter as Status) : Status.PENDING;

  // pagination numbers
  const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
  const pageSize = Math.max(parseInt(limit as string, 10) || 10, 1);
  const skip = (pageNumber - 1) * pageSize;
  const take = pageSize;
  try {
    const [list, total] = await Promise.all([
      prisma.postApplied.findMany({
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
              country: true,
              userImages: {
                select: {
                  image: true
                }
              }
            }
          }
        },
        where: {
          postId: id,
          status: statusFilter,
          user: {
            is: {
              is_active: true
            }
          }
        },
        skip,
        take,
        orderBy: { createdAt: "desc" }
      }),
      prisma.postApplied.count({
        where: {
          postId: id,
          status: statusFilter,
          user: {
            is: {
              is_active: true
            }
          }
        }
      })
    ]);
    return res.json({
      list,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

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
};

export const recruiterGetPost = async (req: Request, res: Response) => {
  try {
    const { filter } = req.query;
    const postCount = await prisma.post.count({
      where: {
        userId: req.userId,
        is_active: true,
        endDate:
          filter === "COMPLETED"
            ? { lt: new Date() } // completed = endDate in future
            : { gt: new Date() } // not completed = endDate in past
      }
    });
    const post = await prisma.post.findMany({
      include: {
        _count: {
          select: { comments: true }
        }
      },
      where: {
        userId: req.userId,
        is_active: true,
        endDate:
          filter === "COMPLETED"
            ? { lt: new Date() } // completed = endDate in future
            : { gt: new Date() } // not completed = endDate in past
      }
    });
    const postApplicationsCount = await prisma.postApplied.groupBy({
      by: ["status"],
      where: {
        post: {
          userId: req.userId,
          is_active: true,
          endDate:
            filter === "COMPLETED"
              ? { lt: new Date() } // completed = endDate in past
              : { gt: new Date() } // not completed = endDate in future
        }
      },
      _count: {
        _all: true
      }
    });
    const postsWithCount = post.map(({ _count, ...rest }) => ({
      ...rest,
      appliedApplicants: _count.comments
    }));
    res.status(200).json({
      post: postsWithCount,
      dashboard: postApplicationsCount,
      count: postCount
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const savePost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const post = await prisma.savePosts.create({
      data: {
        userId: req.userId as string,
        postId: postId as string
      }
    });
    res.status(200).json(post);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

export const getSavePosts = async (req: Request, res: Response) => {
  try {
    const saved = await prisma.savePosts.findMany({
      where: {
        userId: req.userId,
        post: {
          is: {
            is_active: true,
            endDate: { gte: new Date() }
          }
        }
      },
      select: {
        id: true,
        post: {
          select: {
            id: true,
            userId: true,
            title: true,
            role: true,
            content: true,
            requirement: true,
            total: true,
            location: true,
            payment: true,
            paymentDate: true,
            responsibility: true,
            company_name: true,
            is_active: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { comments: true }
            },
            comments: {
              select: {
                id: true,
                status: true
              },
              where: {
                userId: req.userId
              }
            }
          }
        }
      }
    });
    const savedPosts = saved.map(({ post }) => {
      const { _count, comments, ...rest } = post;

      return {
        ...rest,
        appliedFlag: comments.length > 0 ? 1 : 0,
        appliedStatus: comments?.[0]?.status || "Not Applied",
        appliedApplicants: _count.comments
      };
    });
    res.status(200).json(savedPosts);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
