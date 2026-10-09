-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "replacedBy" TEXT;
