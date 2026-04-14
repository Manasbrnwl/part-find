import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/errorHandler";

const prisma = new PrismaClient();

export const getAppVersion = asyncHandler(
  async (req: Request, res: Response) => {
    const platform = req.query.platform as string;

    const appVersion = await prisma.appVersion.findFirst({
      where: platform ? { platform } : undefined,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      message: "App version fetched successfully",
      data: appVersion || {
        version: "1.0.0",
        buildNumber: 1,
        platform: platform || "android",
        forceUpdate: false,
      },
    });
  }
);
