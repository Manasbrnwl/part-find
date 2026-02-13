import { Context, Next } from "hono";
import { verify } from "jsonwebtoken";
import { getPrisma } from "../lib/prisma";

const JWT_SECRET = "your-secret-key"; // Fallback, should come from env

export const authenticate = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED"
      }, 401);
    }

    const token = authHeader.split(" ")[1];
    const secret = c.env?.JWT_SECRET || JWT_SECRET;

    // Verify token
    // @ts-ignore
    const decoded = verify(token, secret) as { userId: string };

    const prisma = getPrisma(c.env);

    // Find user
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
        is_active: true
      }
    });

    if (!user) {
      return c.json({
        success: false,
        message: "User not found or inactive",
        code: "USER_INVALID"
      }, 401);
    }

    // Set userId in context
    c.set("userId", user.id);
    c.set("user", user);

    await next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return c.json({
        success: false,
        message: "Access token expired",
        code: "TOKEN_EXPIRED"
      }, 401);
    }

    if (error.name === 'JsonWebTokenError') {
      return c.json({
        success: false,
        message: "Invalid token",
        code: "TOKEN_INVALID"
      }, 401);
    }

    return c.json({
      success: false,
      message: "Server error",
      error: error.message
    }, 500);
  }
};

export const authorize = (allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user: any = c.get("user");

    if (!user) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    if (!user.role) {
      return c.json({ message: "Forbidden: Insufficient permissions" }, 403);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ message: "Forbidden: Insufficient permissions" }, 403);
    }

    await next();
  };
};
