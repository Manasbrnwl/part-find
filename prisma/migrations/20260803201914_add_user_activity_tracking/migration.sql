-- Purely additive: two new nullable columns on "User". No existing
-- columns, types, or constraints are touched, so this is safe to apply
-- against the live production database without downtime and without
-- affecting the Flutter app's existing API contracts.
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastWinBackEmailAt" TIMESTAMP(3);
