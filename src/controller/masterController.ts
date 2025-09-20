import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import {
  handleControllerError,
  handleNotFoundError,
  handleValidationError,
  asyncHandler,
} from "../utils/errorHandler";

const prisma = new PrismaClient();

export const categoryLists = asyncHandler(
  async (req: Request, res: Response) => {
    const catergoryList = await prisma.jobCategory.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
    res.status(201).json(catergoryList);
  }
);
