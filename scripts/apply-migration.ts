#!/usr/bin/env bun
import postgres from 'postgres';

const TARGET_URL =
  process.env.TARGET_DIRECT_DATABASE_URL || process.env.TARGET_DATABASE_URL;
const db = postgres(TARGET_URL!, { ssl: 'require' });

const statements = [
  // Create UserApiKey table
  `CREATE TABLE IF NOT EXISTS "UserApiKey" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "keyHash" text NOT NULL,
    "name" text,
    "lastUsedAt" timestamp,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "expiresAt" timestamp,
    "revokedAt" timestamp
  )`,

  // Add signupPointsAwarded column to Referral
  `DO $$ BEGIN
    ALTER TABLE "Referral" ADD COLUMN "signupPointsAwarded" boolean DEFAULT false NOT NULL;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END $$`,

  // Create indexes
  `CREATE INDEX IF NOT EXISTS "UserApiKey_userId_idx" ON "UserApiKey" USING btree ("userId")`,
  `CREATE INDEX IF NOT EXISTS "UserApiKey_keyHash_idx" ON "UserApiKey" USING btree ("keyHash")`,
  `CREATE INDEX IF NOT EXISTS "UserApiKey_userId_revokedAt_idx" ON "UserApiKey" USING btree ("userId","revokedAt")`,
  `CREATE INDEX IF NOT EXISTS "Referral_referrerId_status_qualifiedAt_signupPointsAwarded_idx" ON "Referral" USING btree ("referrerId","status","qualifiedAt","signupPointsAwarded")`,
  `CREATE INDEX IF NOT EXISTS "Referral_referrerId_signupPointsAwarded_completedAt_idx" ON "Referral" USING btree ("referrerId","signupPointsAwarded","completedAt")`,

  // Drop columns from SystemSettings
  `ALTER TABLE "SystemSettings" DROP COLUMN IF EXISTS "wandbModel"`,
  `ALTER TABLE "SystemSettings" DROP COLUMN IF EXISTS "wandbEnabled"`,
];

console.log('Applying migration to target database...\n');

for (const sql of statements) {
  try {
    await db.unsafe(sql);
    console.log('✓', sql.slice(0, 70).replace(/\n/g, ' ') + '...');
  } catch (e: unknown) {
    const err = e as Error;
    console.log('⚠', sql.slice(0, 70).replace(/\n/g, ' ') + '...', err.message);
  }
}

await db.end();
console.log('\n✓ Migration complete!');
