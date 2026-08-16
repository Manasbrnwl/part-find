-- Admin moderation for job posts.
CREATE TYPE "PostApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Post" ADD COLUMN "approval_status" "PostApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Post" ADD COLUMN "approval_remark" TEXT;
ALTER TABLE "Post" ADD COLUMN "approved_at" TIMESTAMP(3);

-- Existing posts are already live, so grandfather them in as APPROVED.
-- Only posts created AFTER this migration will require admin approval.
UPDATE "Post" SET "approval_status" = 'APPROVED', "approved_at" = "createdAt";
