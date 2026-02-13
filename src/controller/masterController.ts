import { Context } from "hono";
import {
  handleControllerError,
} from "../utils/errorHandler";
import { getPrisma } from "../lib/prisma";

export const categoryLists = async (c: Context) => {
  try {
    const prisma = getPrisma(c.env);
    const catergoryList = await prisma.jobCategory.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
    return c.json(catergoryList, 201);
  } catch (error) {
    return handleControllerError(error, c);
  }
};
