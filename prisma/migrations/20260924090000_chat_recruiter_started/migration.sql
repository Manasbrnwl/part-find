-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN "recruiter_started_at" TIMESTAMP(3);

-- Backfill: any thread the recruiter has already written in counts as started.
UPDATE "ChatThread" t
SET "recruiter_started_at" = m.first_at
FROM (
    SELECT "threadId", MIN("createdAt") AS first_at
    FROM "ChatMessage"
    GROUP BY "threadId"
) m
JOIN "ChatThread" ct ON ct.id = m."threadId"
WHERE t.id = m."threadId"
  AND EXISTS (
      SELECT 1 FROM "ChatMessage" cm
      WHERE cm."threadId" = t.id AND cm."senderId" = ct."recruiterId"
  );
