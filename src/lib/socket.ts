import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { logger } from "../../utils/logger";

/**
 * Socket.IO server for the recruiter ↔ applicant chat.
 *
 * Clients connect with the same JWT they use for REST:
 *   io(BASE_URL, { auth: { token: "<accessToken>" } })
 * Each authenticated socket joins the room `user:<id>`, so any server-side code
 * can push to a person with `emitToUser(userId, event, payload)` regardless of
 * how many devices they have open. Rooms per thread are not needed: a thread
 * only ever has two participants and we address them directly.
 *
 * Events (server → client)
 *   chat:message  { threadId, message }          new message in one of my threads
 *   chat:read     { threadId, readerId, readAt }  the other side read the thread
 *   chat:thread   { thread }                      thread summary changed (new/locked)
 *
 * Events (client → server)
 *   chat:typing   { threadId }                    relayed to the other participant
 */

const JWT_SECRET = process.env.JWT_SECRET as string;

let io: Server | null = null;
// userId -> number of live sockets (to know whether to fall back to push)
const online = new Map<string, number>();

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
    // mobile networks: be forgiving before declaring a client gone
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization as string | undefined)?.replace(/^Bearer /i, "");
      if (!raw) return next(new Error("AUTH_REQUIRED"));
      const decoded = jwt.verify(raw, JWT_SECRET) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId, is_active: true },
        select: { id: true, role: true },
      });
      if (!user) return next(new Error("USER_INVALID"));
      socket.data.userId = user.id;
      socket.data.role = user.role;
      next();
    } catch {
      next(new Error("AUTH_INVALID"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    online.set(userId, (online.get(userId) || 0) + 1);

    socket.on("chat:typing", async (payload: { threadId?: string }) => {
      const threadId = payload?.threadId;
      if (!threadId) return;
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        select: { applicantId: true, recruiterId: true },
      });
      if (!thread) return;
      const other =
        thread.applicantId === userId ? thread.recruiterId : thread.recruiterId === userId ? thread.applicantId : null;
      if (other) emitToUser(other, "chat:typing", { threadId, userId });
    });

    socket.on("disconnect", () => {
      const n = (online.get(userId) || 1) - 1;
      if (n <= 0) online.delete(userId);
      else online.set(userId, n);
    });
  });

  logger.info("Socket.IO chat server attached");
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function isUserOnline(userId: string): boolean {
  return (online.get(userId) || 0) > 0;
}
