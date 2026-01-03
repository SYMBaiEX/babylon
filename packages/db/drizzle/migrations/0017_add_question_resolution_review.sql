ALTER TABLE "Question" ADD COLUMN "resolutionConfidence" double precision;
ALTER TABLE "Question" ADD COLUMN "requiresManualReview" boolean NOT NULL DEFAULT false;
ALTER TABLE "Question" ADD COLUMN "resolutionReviewStatus" text;
ALTER TABLE "Question" ADD COLUMN "resolutionReviewedAt" timestamp;
ALTER TABLE "Question" ADD COLUMN "resolutionReviewedBy" text;

CREATE INDEX IF NOT EXISTS "Question_requiresManualReview_status_idx"
ON "Question" ("requiresManualReview", "resolutionReviewStatus", "status");

