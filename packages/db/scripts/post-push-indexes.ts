/**
 * Post db:push script to create partial indexes that Drizzle doesn't support natively.
 *
 * Run this after `bun run db:push` to ensure custom indexes are created.
 *
 * Usage: DATABASE_URL="..." bun run packages/db/scripts/post-push-indexes.ts
 */

import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  console.log('Creating partial indexes...\n');

  // GroupMember: Partial unique index for soft deletes
  // Only one active member per (groupId, userId), but allows multiple inactive records
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "GroupMember_groupId_userId_active_key" 
      ON "GroupMember" ("groupId", "userId") 
      WHERE "isActive" = true
    `;
    console.log('✓ GroupMember_groupId_userId_active_key (partial unique index)');
  } catch (e) {
    const error = e as Error;
    if (error.message?.includes('already exists')) {
      console.log('✓ GroupMember_groupId_userId_active_key (already exists)');
    } else {
      console.error('✗ GroupMember_groupId_userId_active_key:', error.message);
    }
  }

  await sql.end();
  console.log('\n✓ Post-push indexes complete!');
}

main().catch(console.error);
