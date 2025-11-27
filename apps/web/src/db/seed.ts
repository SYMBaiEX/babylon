/**
 * Database Seed Script
 *
 * Seeds the database with initial data for development and testing.
 * Run with: bun run db:seed
 */

import { logger } from '@/lib/logger';
import { db, generateId, now } from './index';
import { games, organizations, users } from './schema';

async function main() {
  logger.info('[Seed] Starting database seed...');

  // Check if database is already seeded
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    logger.info('[Seed] Database already has data, skipping seed');
    return;
  }

  // Create default game
  const gameId = generateId();
  await db.insert(games).values({
    id: gameId,
    currentDay: 1,
    currentDate: now(),
    isRunning: false,
    isContinuous: true,
    speed: 60000,
    activeQuestions: 0,
    createdAt: now(),
    updatedAt: now(),
  });
  logger.info(`[Seed] Created game: ${gameId}`);

  // Create sample organizations
  const sampleOrgs = [
    {
      name: 'Meta AI',
      ticker: 'METAI',
      description: 'Social media and AI conglomerate',
      type: 'tech',
    },
    {
      name: 'Nvidia AI',
      ticker: 'NVDAI',
      description: 'GPU and AI chip manufacturer',
      type: 'tech',
    },
    {
      name: 'OpenLIE',
      ticker: 'OLIE',
      description: 'AI research company',
      type: 'tech',
    },
    {
      name: 'Gooble',
      ticker: 'GOOB',
      description: 'Search and AI giant',
      type: 'tech',
    },
    {
      name: 'Amazone',
      ticker: 'AMZN',
      description: 'E-commerce and cloud computing',
      type: 'tech',
    },
  ];

  for (const org of sampleOrgs) {
    await db.insert(organizations).values({
      id: generateId(),
      name: org.name,
      ticker: org.ticker,
      description: org.description,
      type: org.type,
      canBeInvolved: true,
      initialPrice: 100,
      currentPrice: 100,
      createdAt: now(),
      updatedAt: now(),
    });
    logger.info(`[Seed] Created organization: ${org.name} (${org.ticker})`);
  }

  logger.info('[Seed] Database seed complete!');
}

main().catch((error) => {
  logger.error('[Seed] Error seeding database', { error });
  process.exit(1);
});
