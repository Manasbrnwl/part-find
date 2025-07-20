-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "phone_number" TEXT,
    "password" TEXT NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 2,
    "fcm_token" TEXT,
    "jwt_token" TEXT,
    "otp" TEXT,
    "otp_exp" TIMESTAMP(3),
    "hieght" INTEGER,
    "weight" INTEGER,
    "gender" INTEGER,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "profile_image" TEXT,
    "zip_code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "role_name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_number_key" ON "User"("phone_number");
