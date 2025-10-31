#!/usr/bin/env bun

/**
 * Database Seed Script
 * 
 * Seeds the database with:
 * - All actors from actors.json
 * - All organizations from actors.json
 * - Initial game state
 * 
 * Run: bun run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

interface ActorsDatabase {
  actors: any[];
  organizations: any[];
}

async function main() {
  logger.info('SEEDING DATABASE', undefined, 'Script');

  // Load actors.json
  const actorsPath = join(process.cwd(), 'data', 'actors.json');
  const actorsData: ActorsDatabase = JSON.parse(readFileSync(actorsPath, 'utf-8'));

  logger.info('Loaded:', {
    actors: actorsData.actors.length,
    organizations: actorsData.organizations.length
  }, 'Script');

  // Seed actors
  logger.info('Seeding actors...', undefined, 'Script');
  for (const actor of actorsData.actors) {
    await prisma.actor.upsert({
      where: { id: actor.id },
      create: {
        id: actor.id,
        name: actor.name,
        description: actor.description,
        domain: actor.domain || [],
        personality: actor.personality,
        tier: actor.tier,
        affiliations: actor.affiliations || [],
        postStyle: actor.postStyle,
        postExample: actor.postExample || [],
      },
      update: {
        name: actor.name,
        description: actor.description,
        domain: actor.domain || [],
        personality: actor.personality,
        tier: actor.tier,
        affiliations: actor.affiliations || [],
        postStyle: actor.postStyle,
        postExample: actor.postExample || [],
      },
    });
  }
  logger.info(`Seeded ${actorsData.actors.length} actors`, undefined, 'Script');

  // Seed organizations
  logger.info('Seeding organizations...', undefined, 'Script');
  let orgCount = 0;
  for (const org of actorsData.organizations) {
    // Skip if missing required fields
    if (!org.id || !org.name || !org.type) {
      logger.warn(`Skipping org "${org.id || 'unknown'}" - missing required fields`, undefined, 'Script');
      continue;
    }

    await prisma.organization.upsert({
      where: { id: org.id },
      create: {
        id: org.id,
        name: org.name,
        description: org.description || '',
        type: org.type,
        canBeInvolved: org.canBeInvolved !== false,
        initialPrice: org.initialPrice || null,
        currentPrice: org.initialPrice || null,
      },
      update: {
        name: org.name,
        description: org.description || '',
        type: org.type,
        canBeInvolved: org.canBeInvolved !== false,
        initialPrice: org.initialPrice || null,
        currentPrice: org.initialPrice || org.currentPrice || null,
      },
    });
    orgCount++;
  }
  logger.info(`Seeded ${orgCount} organizations`, undefined, 'Script');

  // Initialize game state
  logger.info('Initializing game state...', undefined, 'Script');
  const existingGame = await prisma.game.findFirst({
    where: { isContinuous: true },
  });

  if (!existingGame) {
    await prisma.game.create({
      data: {
        isContinuous: true,
        isRunning: true,
        currentDate: new Date(),
        currentDay: 1,
        speed: 60000,
      },
    });
    logger.info('Game state initialized', undefined, 'Script');
  } else {
    logger.info('Game state already exists', undefined, 'Script');
  }

  // Stats
  const stats = {
    actors: await prisma.actor.count(),
    organizations: await prisma.organization.count(),
    companies: await prisma.organization.count({ where: { type: 'company' } }),
    posts: await prisma.post.count(),
  };

  logger.info('Database Summary:', {
    actors: stats.actors,
    organizations: `${stats.organizations} (${stats.companies} companies)`,
    posts: stats.posts
  }, 'Script');

  logger.info('SEED COMPLETE', undefined, 'Script');
}

main()
  .catch((error) => {
    logger.error('Seed failed:', error, 'Script');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
