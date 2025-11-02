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

import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

interface ActorsDatabase {
  actors: any[];
  organizations: any[];
}

async function main() {
  logger.info('SEEDING DATABASE', undefined, 'Script');

  // Load actors.json - try both locations
  let actorsPath = join(process.cwd(), 'public', 'data', 'actors.json');
  if (!existsSync(actorsPath)) {
    actorsPath = join(process.cwd(), 'data', 'actors.json');
  }
  
  if (!existsSync(actorsPath)) {
    logger.error('actors.json not found in public/data/ or data/', undefined, 'Script');
    throw new Error('actors.json not found');
  }
  
  const actorsData: ActorsDatabase = JSON.parse(readFileSync(actorsPath, 'utf-8'));

  logger.info('Loaded:', {
    actors: actorsData.actors.length,
    organizations: actorsData.organizations.length
  }, 'Script');

  // Seed actors
  logger.info('Seeding actors...', undefined, 'Script');
  let poolActorsCount = 0;
  
  for (const actor of actorsData.actors) {
    // Check if actor has a pool and if profile image exists
    const hasPool = actor.hasPool === true;
    const imagePath = join(process.cwd(), 'public', 'images', 'actors', `${actor.id}.jpg`);
    const profileImageUrl = existsSync(imagePath) ? `/images/actors/${actor.id}.jpg` : null;
    
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
        hasPool: hasPool,
        tradingBalance: hasPool ? 10000 : 0,
        reputationPoints: hasPool ? 10000 : 0,
        profileImageUrl: profileImageUrl,
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
        hasPool: hasPool,
        // Only update trading balance and points if hasPool
        ...(hasPool && {
          tradingBalance: 10000,
          reputationPoints: 10000,
        }),
        // Update profile image if it exists
        ...(profileImageUrl && { profileImageUrl }),
      },
    });
    
    if (hasPool) poolActorsCount++;
  }
  logger.info(`Seeded ${actorsData.actors.length} actors (${poolActorsCount} with trading pools)`, undefined, 'Script');

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

  // Initialize pools for actors with hasPool=true
  logger.info('Initializing trading pools...', undefined, 'Script');
  const poolActors = await prisma.actor.findMany({
    where: { hasPool: true },
    select: { id: true, name: true },
  });
  
  let poolsCreated = 0;
  for (const actor of poolActors) {
    // Check if pool already exists
    const existingPool = await prisma.pool.findFirst({
      where: { npcActorId: actor.id },
    });
    
    if (!existingPool) {
      await prisma.pool.create({
        data: {
          npcActorId: actor.id,
          name: `${actor.name}'s Pool`,
          description: `Trading pool managed by ${actor.name}`,
          totalValue: new Prisma.Decimal(0),
          totalDeposits: new Prisma.Decimal(0),
          availableBalance: new Prisma.Decimal(0),
          lifetimePnL: new Prisma.Decimal(0),
          performanceFeeRate: 0.08,
          totalFeesCollected: new Prisma.Decimal(0),
          isActive: true,
        },
      });
      poolsCreated++;
    }
  }
  
  logger.info(`Initialized ${poolsCreated} new pools (${poolActors.length} total pool actors)`, undefined, 'Script');

  // Stats
  const stats = {
    actors: await prisma.actor.count(),
    poolActors: await prisma.actor.count({ where: { hasPool: true } }),
    pools: await prisma.pool.count(),
    organizations: await prisma.organization.count(),
    companies: await prisma.organization.count({ where: { type: 'company' } }),
    posts: await prisma.post.count(),
  };

  logger.info('Database Summary:', {
    actors: `${stats.actors} (${stats.poolActors} traders with pools)`,
    pools: stats.pools,
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
