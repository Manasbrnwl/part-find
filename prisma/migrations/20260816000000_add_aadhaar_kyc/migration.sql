-- Add Aadhaar KYC fields to User.
-- Nullable so existing users are unaffected; "mandatory" is enforced in the app layer.
ALTER TABLE "User" ADD COLUMN "aadhaar_number" TEXT;
ALTER TABLE "User" ADD COLUMN "aadhaar_image" TEXT;

-- One Aadhaar per account (NULLs are allowed to coexist in Postgres unique indexes).
CREATE UNIQUE INDEX "User_aadhaar_number_key" ON "User"("aadhaar_number");
