-- AlterTable
ALTER TABLE "Post" ADD COLUMN "state" VARCHAR(100);

-- CreateIndex
CREATE INDEX "Post_state_idx" ON "Post"("state");
