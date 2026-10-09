import { NotificationType } from "../queues/notificationQueue";

/**
 * Where the app should navigate when a notification is tapped.
 *
 * Every push and every in-app feed row carries a `route` string in its data
 * payload; the app reads it and navigates, so adding a notification type never
 * needs an app release. Path parameters are already substituted here — the app
 * receives `/user/event-detail/abc123`, not a pattern.
 *
 * Routes come from the Flutter route table (lib/core/router/app_router.dart).
 * Three of them differ from the mapping the app team sent, because the screen
 * they named can only be reached with a Dart object handed over in `extra`,
 * which a push cannot carry:
 *
 *   - accepted/rejected + absent warning → `/user/event-applied` needs a
 *     non-nullable `RequestPost`; `/user/event-detail/:postId` shows the same
 *     event and loads it from the id.
 *   - rating received + low-rating warning → `/user/ratings` casts
 *     `extra as Map<String, dynamic>` and crashes on null; `/user/profile`
 *     is the ratings' home tab.
 *   - post approved → `/recruiter/event-info` needs a non-nullable `Post`;
 *     `/recruiter/show-users/:postId` opens that post from its id.
 *
 * If those three screens are later changed to accept a path parameter, only
 * this file needs to move to the originally specified routes.
 */

export interface RouteContext {
    postId?: string | null;
    threadId?: string | null;
    /** Recipient's role — only the inactivity nudge routes differently per role. */
    role?: string | null;
}

/** Tabs to fall back to when the id a route needs isn't available. */
const USER_APPLICATIONS = "/user/requests";
const USER_HOME = "/user/discover";
const RECRUITER_EVENTS = "/recruiter/events";
const RECRUITER_HOME = "/recruiter/dashboard";

const isRecruiter = (role?: string | null) => {
    const r = String(role || "").toUpperCase();
    return r === "RECRUITER" || r === "SERVICE_SEEKER";
};

export function resolveNotificationRoute(type: string, ctx: RouteContext = {}): string | null {
    const { postId, threadId, role } = ctx;

    switch (type) {
        // ── To candidates ───────────────────────────────────────────────────
        case NotificationType.NEW_JOB_POSTED:
        case NotificationType.JOB_REMINDER:
        case NotificationType.APPLICATION_STATUS:
        case NotificationType.ABSENT_WARNING:
            return postId ? `/user/event-detail/${postId}` : USER_APPLICATIONS;

        case NotificationType.APPLICATION_NOT_SELECTED:
            return USER_HOME;

        case NotificationType.RATING_RECEIVED:
        case NotificationType.LOW_RATING_WARNING:
            return "/user/profile";

        case NotificationType.COMPLETION_CERTIFICATE:
            return "/user/certificates";

        // ── To recruiters ───────────────────────────────────────────────────
        case NotificationType.NEW_APPLICATION:
        case NotificationType.NEW_APPLICATION_DIGEST:
        case NotificationType.POST_APPROVED:
            return postId ? `/recruiter/show-users/${postId}` : RECRUITER_EVENTS;

        // ── Either role ─────────────────────────────────────────────────────
        case NotificationType.INACTIVE_USER_REMINDER:
            return isRecruiter(role) ? RECRUITER_HOME : USER_HOME;

        case NotificationType.CHAT_MESSAGE:
            if (threadId) return `/chat/thread/${threadId}`;
            return isRecruiter(role) ? "/recruiter/chats" : "/user/chats";

        // Admin messages are deliberately excluded from the mapping, and the
        // remaining types are internal jobs that never reach a device.
        default:
            return null;
    }
}
