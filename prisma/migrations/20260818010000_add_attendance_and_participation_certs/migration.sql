-- Attendance marking on applications + participation certificates (rating optional).
ALTER TABLE "postApplied" ADD COLUMN "attended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "postApplied" ADD COLUMN "attended_at" TIMESTAMP(3);

-- Certificates can now be issued for attendance before any rating exists.
ALTER TABLE "Certificate" ALTER COLUMN "rating" DROP NOT NULL;
