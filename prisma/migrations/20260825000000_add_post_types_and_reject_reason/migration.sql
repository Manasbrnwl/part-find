-- Employment type of a post (Part-Time, Full-Time, ...). Admin-managed.
CREATE TABLE "PostType" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostType_name_key" ON "PostType"("name");

-- Seed the standard set of employment types.
INSERT INTO "PostType" ("name", "description", "is_active", "created_at", "updated_at") VALUES
    ('Part-Time',    'Fewer than full-time hours',                 true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Full-Time',    'Standard full-time employment',              true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Internship',   'Training-focused, often for students',       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Contract',     'Fixed-term contractual engagement',          true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Freelance',    'Independent, project-based work',            true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Temporary',    'Short-term / seasonal work',                 true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Gig / One-Day','Single-day or one-off gig',                  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Weekend',      'Weekend-only work',                          true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Volunteer',    'Unpaid, voluntary work',                     true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Remote',       'Work-from-anywhere role',                    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Link posts to a type (nullable so existing posts remain valid).
ALTER TABLE "Post" ADD COLUMN "type_id" INTEGER;
ALTER TABLE "Post" ADD CONSTRAINT "Post_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "PostType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reason a recruiter/admin rejected an application (shown to the applicant).
ALTER TABLE "postApplied" ADD COLUMN "reject_reason" TEXT;
