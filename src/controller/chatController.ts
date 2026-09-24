import { Request, Response } from "express";
import { Prisma, Status } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emitToUser, isUserOnline } from "../lib/socket";
import { asyncHandler, handleForbiddenError, handleNotFoundError, handleValidationError } from "../utils/errorHandler";
import { parsePagination, paginationMeta, searchTerm, contains } from "../utils/pagination";
import { notifyUser } from "../utils/notificationStore";
import { NotificationType } from "../queues/notificationQueue";
import { logger } from "../../utils/logger";

/**
 * Recruiter ↔ applicant chat.
 *
 * A thread exists per application (created on apply, or lazily for
 * applications made before this feature). It is OPEN until the post starts;
 * from post.startDate onwards it is locked (read-only) for both sides.
 */

export const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 120;

const participantSelect = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  role: true,
  recruiter_company_name: true,
  recruiter_company_logo: true,
  userImages: { where: { is_deleted: false }, select: { image: true }, take: 1 },
} satisfies Prisma.UserSelect;

const postSelect = {
  id: true,
  title: true,
  company_name: true,
  location: true,
  startDate: true,
  endDate: true,
  is_active: true,
} satisfies Prisma.PostSelect;

const threadInclude = {
  post: { select: postSelect },
  applicant: { select: participantSelect },
  recruiter: { select: participantSelect },
  application: { select: { id: true, status: true } },
} satisfies Prisma.ChatThreadInclude;

type ThreadRow = Prisma.ChatThreadGetPayload<{ include: typeof threadInclude }>;

/**
 * Whether the viewer may send right now, and why not.
 *
 * An APPROVED applicant can write freely — they don't wait for the recruiter.
 * Anyone else (pending / rejected / withdrawn / no-show) can only reply once
 * the recruiter has written first, which is what recruiter_started_at records.
 * The recruiter may always open a thread with any of their applicants.
 */
function sendPermission(
  thread: { applicantId: string; recruiterId: string; recruiter_started_at: Date | null; application: { status: Status | null } },
  viewerId: string | null,
  isOpen: boolean
): { canSend: boolean; reason: string | null } {
  if (!isOpen) return { canSend: false, reason: "CHAT_CLOSED" };
  if (viewerId === thread.recruiterId) return { canSend: true, reason: null };
  if (viewerId !== thread.applicantId) return { canSend: false, reason: "NOT_A_PARTICIPANT" };

  if (thread.application.status === Status.APPROVED) return { canSend: true, reason: null };
  if (thread.recruiter_started_at) return { canSend: true, reason: null };
  return { canSend: false, reason: "AWAITING_RECRUITER" };
}

/** A thread is open for messaging until the post's start time. */
export function threadOpenState(post: { startDate: Date; is_active: boolean }) {
  const now = new Date();
  if (post.startDate <= now) return { isOpen: false, closedReason: "EVENT_STARTED" as const };
  if (!post.is_active) return { isOpen: false, closedReason: "POST_INACTIVE" as const };
  return { isOpen: true, closedReason: null };
}

/** Shape a thread for the API from the viewpoint of `viewerId` (admin: null). */
function shapeThread(thread: ThreadRow, viewerId: string | null, unreadCount = 0) {
  const state = threadOpenState(thread.post);
  const permission = sendPermission(thread, viewerId, state.isOpen);
  const myLastRead =
    viewerId === thread.applicantId
      ? thread.applicant_last_read_at
      : viewerId === thread.recruiterId
      ? thread.recruiter_last_read_at
      : null;
  return {
    id: thread.id,
    postId: thread.postId,
    applicationId: thread.applicationId,
    applicationStatus: thread.application.status,
    post: thread.post,
    applicant: thread.applicant,
    recruiter: thread.recruiter,
    // who the viewer is talking to
    otherParty: viewerId === thread.applicantId ? thread.recruiter : thread.applicant,
    myRole: viewerId === thread.applicantId ? "APPLICANT" : viewerId === thread.recruiterId ? "RECRUITER" : "ADMIN",
    isOpen: state.isOpen,
    closedReason: state.closedReason,
    // viewer-specific: the thread can be open while this person still may not write
    canSendMessage: permission.canSend,
    cannotSendReason: permission.reason,
    recruiterStarted: thread.recruiter_started_at !== null,
    closesAt: thread.post.startDate,
    lastMessageAt: thread.last_message_at,
    lastMessagePreview: thread.last_message_preview,
    lastSenderId: thread.last_sender_id,
    messageCount: thread.message_count,
    unreadCount,
    myLastReadAt: myLastRead,
    createdAt: thread.createdAt,
  };
}

async function unreadCountFor(thread: { id: string; applicantId: string; recruiterId: string; applicant_last_read_at: Date | null; recruiter_last_read_at: Date | null }, userId: string) {
  const lastRead = userId === thread.applicantId ? thread.applicant_last_read_at : thread.recruiter_last_read_at;
  return prisma.chatMessage.count({
    where: {
      threadId: thread.id,
      senderId: { not: userId },
      ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
    },
  });
}

/**
 * Create the thread for an application if it doesn't exist yet. Used on apply
 * and lazily when a thread is requested for an older application.
 */
export async function ensureThreadForApplication(applicationId: string) {
  const existing = await prisma.chatThread.findUnique({ where: { applicationId }, include: threadInclude });
  if (existing) return existing;

  const application = await prisma.postApplied.findUnique({
    where: { id: applicationId },
    select: { id: true, userId: true, postId: true, post: { select: { userId: true } } },
  });
  if (!application) throw handleNotFoundError("Application");

  try {
    return await prisma.chatThread.create({
      data: {
        postId: application.postId,
        applicationId: application.id,
        applicantId: application.userId,
        recruiterId: application.post.userId,
      },
      include: threadInclude,
    });
  } catch (err: any) {
    // raced with another request creating the same thread
    if (err?.code === "P2002") {
      const again = await prisma.chatThread.findUnique({ where: { applicationId }, include: threadInclude });
      if (again) return again;
    }
    throw err;
  }
}

async function loadThreadForUser(threadId: string, userId: string) {
  const thread = await prisma.chatThread.findUnique({ where: { id: threadId }, include: threadInclude });
  if (!thread) throw handleNotFoundError("Chat");
  if (thread.applicantId !== userId && thread.recruiterId !== userId) {
    throw handleForbiddenError("You are not a participant of this chat");
  }
  return thread;
}

// ── Participant endpoints ────────────────────────────────────────────────────

/** GET /chat/threads?page&limit&status=open|closed */
export const listMyThreads = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const { page, limit, skip, take } = parsePagination(req, { defaultLimit: 30 });
  const status = req.query.status as string | undefined;

  // A candidate only sees threads they can actually use: approved
  // applications, or ones the recruiter has already opened. Recruiters see all
  // of theirs. (Without this, applying to 20 gigs would show 20 empty chats.)
  const where: Prisma.ChatThreadWhereInput = {
    OR: [
      {
        applicantId: userId,
        OR: [{ application: { status: Status.APPROVED } }, { recruiter_started_at: { not: null } }],
      },
      { recruiterId: userId },
    ],
    ...(status === "open"
      ? { post: { startDate: { gt: new Date() } } }
      : status === "closed"
      ? { post: { startDate: { lte: new Date() } } }
      : {}),
  };

  const [threads, total] = await Promise.all([
    prisma.chatThread.findMany({
      where,
      include: threadInclude,
      // most recent conversation first; never-messaged threads by creation
      orderBy: [{ last_message_at: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.chatThread.count({ where }),
  ]);

  const unread = await Promise.all(threads.map((t) => unreadCountFor(t, userId)));

  res.status(200).json({
    success: true,
    data: threads.map((t, i) => shapeThread(t, userId, unread[i])),
    pagination: paginationMeta(page, limit, total),
  });
});

/** GET /chat/unread-count — badge for the app */
export const myUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [
        {
          applicantId: userId,
          OR: [{ application: { status: Status.APPROVED } }, { recruiter_started_at: { not: null } }],
        },
        { recruiterId: userId },
      ],
    },
    select: { id: true, applicantId: true, recruiterId: true, applicant_last_read_at: true, recruiter_last_read_at: true, last_message_at: true, last_sender_id: true },
  });
  // only threads where the other side spoke last can have unread messages
  const candidates = threads.filter((t) => t.last_message_at && t.last_sender_id !== userId);
  const counts = await Promise.all(candidates.map((t) => unreadCountFor(t, userId)));
  const total = counts.reduce((a, b) => a + b, 0);
  const threadsWithUnread = counts.filter((c) => c > 0).length;
  res.status(200).json({ success: true, data: { total, threads: threadsWithUnread } });
});

/** GET /chat/threads/by-application/:applicationId — get (or create) the thread */
export const threadForApplication = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const applicationId = req.params.applicationId as string;
  const thread = await ensureThreadForApplication(applicationId);
  if (thread.applicantId !== userId && thread.recruiterId !== userId) {
    throw handleForbiddenError("You are not a participant of this chat");
  }
  const unread = await unreadCountFor(thread, userId);
  res.status(200).json({ success: true, data: shapeThread(thread, userId, unread) });
});

/**
 * GET /chat/threads/lookup?postId=<id>[&applicantId=<id>]
 * Find (or create) the thread for a post from what each side already has:
 * the applicant passes just the postId; the recruiter also passes applicantId.
 */
export const lookupThread = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const postId = String(req.query.postId ?? "").trim();
  const applicantId = String(req.query.applicantId ?? userId).trim();
  if (!postId) throw handleValidationError("postId is required");

  const application = await prisma.postApplied.findFirst({
    where: { postId, userId: applicantId },
    select: { id: true },
  });
  if (!application) throw handleNotFoundError("Application");

  const thread = await ensureThreadForApplication(application.id);
  if (thread.applicantId !== userId && thread.recruiterId !== userId) {
    throw handleForbiddenError("You are not a participant of this chat");
  }
  const unread = await unreadCountFor(thread, userId);
  res.status(200).json({ success: true, data: shapeThread(thread, userId, unread) });
});

/** GET /chat/threads/:id */
export const getThread = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const thread = await loadThreadForUser(req.params.id as string, userId);
  const unread = await unreadCountFor(thread, userId);
  res.status(200).json({ success: true, data: shapeThread(thread, userId, unread) });
});

/**
 * GET /chat/threads/:id/messages?before=<iso>&limit=50
 * Newest-first pages keyed on createdAt; opening the thread marks it read.
 */
export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const thread = await loadThreadForUser(req.params.id as string, userId);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50", 10) || 50));
  const beforeRaw = req.query.before as string | undefined;
  const before = beforeRaw ? new Date(beforeRaw) : null;

  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId: thread.id,
      ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: { id: true, threadId: true, senderId: true, body: true, createdAt: true },
  });
  const hasMore = messages.length > limit;
  const pageRows = hasMore ? messages.slice(0, limit) : messages;

  await markThreadRead(thread, userId);

  res.status(200).json({
    success: true,
    data: {
      thread: shapeThread(thread, userId, 0),
      // chronological for the client
      messages: pageRows.reverse(),
      hasMore,
      nextBefore: hasMore ? pageRows[0].createdAt : null,
    },
  });
});

/** POST /chat/threads/:id/messages { body } */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const body = String(req.body?.body ?? "").trim();
  if (!body) throw handleValidationError("Message cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) throw handleValidationError(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);

  const thread = await loadThreadForUser(req.params.id as string, userId);
  const state = threadOpenState(thread.post);
  if (!state.isOpen) {
    throw handleValidationError(
      state.closedReason === "EVENT_STARTED"
        ? "This chat is closed because the event has started"
        : "This chat is closed"
    );
  }

  const permission = sendPermission(thread, userId, state.isOpen);
  if (!permission.canSend) {
    throw handleValidationError(
      permission.reason === "AWAITING_RECRUITER"
        ? "You can message the recruiter once your application is approved, or after they message you first"
        : "You cannot send messages in this chat"
    );
  }

  const message = await deliverMessage(thread, userId, body);
  res.status(201).json({ success: true, data: message });
});

/** POST /chat/threads/:id/read */
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId as string;
  const thread = await loadThreadForUser(req.params.id as string, userId);
  const readAt = await markThreadRead(thread, userId);
  res.status(200).json({ success: true, data: { threadId: thread.id, readAt } });
});

// ── internals ───────────────────────────────────────────────────────────────

async function markThreadRead(thread: ThreadRow, userId: string) {
  const readAt = new Date();
  const isApplicant = thread.applicantId === userId;
  await prisma.chatThread.update({
    where: { id: thread.id },
    data: isApplicant ? { applicant_last_read_at: readAt } : { recruiter_last_read_at: readAt },
  });
  const other = isApplicant ? thread.recruiterId : thread.applicantId;
  emitToUser(other, "chat:read", { threadId: thread.id, readerId: userId, readAt });
  return readAt;
}

async function deliverMessage(thread: ThreadRow, senderId: string, body: string) {
  const now = new Date();
  const isApplicant = thread.applicantId === senderId;
  const recipientId = isApplicant ? thread.recruiterId : thread.applicantId;

  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { threadId: thread.id, senderId, body, createdAt: now },
      select: { id: true, threadId: true, senderId: true, body: true, createdAt: true },
    }),
    prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        last_message_at: now,
        // first recruiter message unlocks replies for a not-yet-approved applicant
        ...(!isApplicant && !thread.recruiter_started_at ? { recruiter_started_at: now } : {}),
        last_message_preview: body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body,
        last_sender_id: senderId,
        message_count: { increment: 1 },
        // sending implies you've seen everything so far
        ...(isApplicant ? { applicant_last_read_at: now } : { recruiter_last_read_at: now }),
      },
    }),
  ]);

  // live delivery to both sides (sender's other devices too)
  emitToUser(recipientId, "chat:message", { threadId: thread.id, message });
  emitToUser(senderId, "chat:message", { threadId: thread.id, message });

  // push + in-app notification when the recipient isn't connected
  if (!isUserOnline(recipientId)) {
    const sender = isApplicant ? thread.applicant : thread.recruiter;
    const senderLabel = isApplicant
      ? sender.name || "An applicant"
      : sender.recruiter_company_name || sender.name || "The recruiter";
    prisma.user
      .findUnique({ where: { id: recipientId }, select: { fcm_token: true } })
      .then((u) =>
        notifyUser({
          userId: recipientId,
          type: NotificationType.CHAT_MESSAGE,
          title: `${senderLabel} · ${thread.post.title}`,
          body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
          postId: thread.postId,
          data: { threadId: thread.id, applicationId: thread.applicationId, messageId: message.id },
          fcmToken: u?.fcm_token,
        })
      )
      .catch((err) => logger.warn(`Chat notification failed for ${recipientId}: ${err?.message}`));
  }

  return message;
}

// ── Admin (read-only moderation) ────────────────────────────────────────────

/** GET /admin/chats?page&limit&search&status=open|closed */
export const adminListThreads = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip, take } = parsePagination(req);
  const search = searchTerm(req);
  const status = req.query.status as string | undefined;

  const where: Prisma.ChatThreadWhereInput = {
    ...(search
      ? {
          OR: [
            { post: { title: contains(search) } },
            { applicant: { name: contains(search) } },
            { applicant: { email: contains(search) } },
            { recruiter: { name: contains(search) } },
            { recruiter: { email: contains(search) } },
            { recruiter: { recruiter_company_name: contains(search) } },
          ],
        }
      : {}),
    ...(status === "open"
      ? { post: { startDate: { gt: new Date() } } }
      : status === "closed"
      ? { post: { startDate: { lte: new Date() } } }
      : {}),
  };

  const [threads, total, withMessages] = await Promise.all([
    prisma.chatThread.findMany({
      where,
      include: threadInclude,
      orderBy: [{ last_message_at: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.chatThread.count({ where }),
    prisma.chatThread.count({ where: { message_count: { gt: 0 } } }),
  ]);

  res.status(200).json({
    success: true,
    data: threads.map((t) => shapeThread(t, null)),
    pagination: paginationMeta(page, limit, total),
    counts: { withMessages },
  });
});

/** GET /admin/chats/:id/messages — whole conversation, chronological */
export const adminThreadMessages = asyncHandler(async (req: Request, res: Response) => {
  const thread = await prisma.chatThread.findUnique({ where: { id: req.params.id as string }, include: threadInclude });
  if (!thread) throw handleNotFoundError("Chat");
  const messages = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderId: true, body: true, createdAt: true },
  });
  res.status(200).json({ success: true, data: { thread: shapeThread(thread, null), messages } });
});
