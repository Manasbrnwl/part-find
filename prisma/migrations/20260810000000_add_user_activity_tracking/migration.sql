-- AlterTable: add activity-tracking columns used by inactive-user reminders
ALTER TABLE "User" ADD COLUMN     "last_active_at" TIMESTAMP(3),
ADD COLUMN     "last_reminded_at" TIMESTAMP(3);

-- Backfill existing users with a baseline activity timestamp (their last update)
-- so the first inactivity scan has something meaningful to compare against.
UPDATE "User" SET "last_active_at" = "updatedAt" WHERE "last_active_at" IS NULL;
