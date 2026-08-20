-- Recruiter can open/close applications early. Existing posts default to open.
ALTER TABLE "Post" ADD COLUMN "is_recruiting" BOOLEAN NOT NULL DEFAULT true;
