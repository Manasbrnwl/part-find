import { PrismaClient } from "@prisma/client";

/**
 * A device's FCM token must belong to exactly ONE account. When a token is about
 * to be assigned to `userId` (login / token refresh), detach it from every other
 * account that currently holds it — otherwise a broadcast reaches that single
 * device once per account sharing the token (duplicate notifications).
 *
 * Call this right before setting fcm_token on `userId`.
 */
export async function releaseFcmTokenFromOthers(
  prisma: PrismaClient,
  userId: string,
  token?: string | null
): Promise<void> {
  if (!token) return;
  await prisma.user.updateMany({
    where: { fcm_token: token, NOT: { id: userId } },
    data: { fcm_token: null },
  });
}
