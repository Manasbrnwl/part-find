-- Time basis for a post's rate/engagement (hourly / daily / monthly).
CREATE TYPE "PayPeriod" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY');

ALTER TABLE "Post" ADD COLUMN "pay_period" "PayPeriod";
