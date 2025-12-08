CREATE TABLE "UserApiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"keyHash" text NOT NULL,
	"name" text,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	"revokedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "Referral" ADD COLUMN "signupPointsAwarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "UserApiKey_userId_idx" ON "UserApiKey" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "UserApiKey_keyHash_idx" ON "UserApiKey" USING btree ("keyHash");--> statement-breakpoint
CREATE INDEX "UserApiKey_userId_revokedAt_idx" ON "UserApiKey" USING btree ("userId","revokedAt");--> statement-breakpoint
CREATE INDEX "Referral_referrerId_status_qualifiedAt_signupPointsAwarded_idx" ON "Referral" USING btree ("referrerId","status","qualifiedAt","signupPointsAwarded");--> statement-breakpoint
CREATE INDEX "Referral_referrerId_signupPointsAwarded_completedAt_idx" ON "Referral" USING btree ("referrerId","signupPointsAwarded","completedAt");--> statement-breakpoint
ALTER TABLE "SystemSettings" DROP COLUMN "wandbModel";--> statement-breakpoint
ALTER TABLE "SystemSettings" DROP COLUMN "wandbEnabled";