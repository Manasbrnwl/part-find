-- Self-service email/phone/role change, confirmed by OTP (kept separate from login OTP).
ALTER TABLE "User" ADD COLUMN "change_otp" TEXT;
ALTER TABLE "User" ADD COLUMN "change_otp_exp" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pending_change" JSONB;
