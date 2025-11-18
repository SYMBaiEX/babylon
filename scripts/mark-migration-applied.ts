#!/usr/bin/env tsx
/**
 * Mark Migration as Applied
 * 
 * Marks a migration as applied when the schema already matches.
 */

import { PrismaClient } from '@prisma/client';

const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_9odB3XWmNCRz@ep-soft-wildflower-a4og8nnb.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function markMigrationApplied(migrationName: string) {
  const prisma = new PrismaClient({
    datasources: { db: { url: PROD_DATABASE_URL } },
  });

  try {
    // Check if already marked
    const existing = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name 
      FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
      AND finished_at IS NOT NULL
    `;

    if (existing.length > 0) {
      console.log(`✅ ${migrationName} already marked as applied`);
      return;
    }

    // Mark as applied (check if record exists first)
    const recordExists = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name 
      FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
    `;

    if (recordExists.length > 0) {
      // Update existing record
      await prisma.$executeRaw`
        UPDATE _prisma_migrations 
        SET finished_at = NOW(), applied_steps_count = 1
        WHERE migration_name = ${migrationName}
      `;
    } else {
      // Insert new record
      await prisma.$executeRaw`
        INSERT INTO _prisma_migrations (migration_name, started_at, finished_at, applied_steps_count)
        VALUES (${migrationName}, NOW(), NOW(), 1)
      `;
    }

    console.log(`✅ Marked ${migrationName} as applied`);
  } finally {
    await prisma.$disconnect();
  }
}

const migrationName = process.argv[2] || '20251115144702';
markMigrationApplied(migrationName).catch(console.error);

