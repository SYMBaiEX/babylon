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

import type { SeedActorsDatabase } from '../src/shared/types';
import { FollowInitializer } from '../src/lib/services/FollowInitializer';

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

  const actorsData: SeedActorsDatabase = JSON.parse(readFileSync(actorsPath, 'utf-8'));

  logger.info('Loaded:', {
    actors: actorsData.actors.length,
    organizations: actorsData.organizations.length
  }, 'Script');

  // Seed actors
  logger.info('Seeding actors...', undefined, 'Script');
  let poolActorsCount = 0;
  
  // Create actors individually (Prisma Accelerate limitation with array fields)
  for (const actor of actorsData.actors) {
    const hasPool = actor.hasPool === true;
    const imagePath = join(process.cwd(), 'public', 'images', 'actors', `${actor.id}.jpg`);
    const profileImageUrl = existsSync(imagePath) ? `/images/actors/${actor.id}.jpg` : null;
    
    if (hasPool) poolActorsCount++;
    
    try {
      await prisma.actor.create({
        data: {
          id: actor.id,
          name: actor.name,
          description: actor.description || null,
          domain: actor.domain || [],
          personality: actor.personality || null,
          tier: actor.tier || null,
          affiliations: actor.affiliations || [],
          postStyle: actor.postStyle || null,
          postExample: actor.postExample || [],
          hasPool: hasPool,
          tradingBalance: hasPool ? new Prisma.Decimal(10000) : new Prisma.Decimal(0),
          reputationPoints: hasPool ? 10000 : 0,
          profileImageUrl: profileImageUrl,
        },
      });
    } catch (error: any) {
      // Skip if actor already exists (P2002 = unique constraint violation)
      if (error.code !== 'P2002') {
        throw error;
      }
    }
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
    
    // Check if organization image exists
    const orgImagePath = join(process.cwd(), 'public', 'images', 'organizations', `${org.id}.jpg`);
    const imageUrl = existsSync(orgImagePath) ? `/images/organizations/${org.id}.jpg` : null;
    
    try {
      await prisma.organization.create({
        data: {
          id: org.id,
          name: org.name,
          description: org.description || '',
          type: org.type,
          canBeInvolved: org.canBeInvolved !== false,
          initialPrice: org.initialPrice || null,
          currentPrice: org.initialPrice || null,
          imageUrl: imageUrl,
        },
      });
      orgCount++;
    } catch (error: any) {
      // Skip if organization already exists (P2002 = unique constraint violation)
      if (error.code !== 'P2002') {
        throw error;
      }
      orgCount++;
    }
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
    try {
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
          isActive: true
        },
      });
      poolsCreated++;
    } catch (error: any) {
      // Skip if pool already exists (P2002 = unique constraint violation)
      if (error.code !== 'P2002') {
        throw error;
      }
      poolsCreated++;
    }
  }
  
  logger.info(`Initialized ${poolsCreated} pools for ${poolActors.length} pool actors`, undefined, 'Script');

  // Seed relationships from actors.json
  logger.info('Seeding actor relationships...', undefined, 'Script');
  
  if (actorsData.relationships && actorsData.relationships.length > 0) {
    logger.info(`Found ${actorsData.relationships.length} relationships in actors.json`, { count: actorsData.relationships.length }, 'Script');
    await FollowInitializer.importRelationships(actorsData.relationships);
    await FollowInitializer.createFollows(actorsData.relationships);
    logger.info('Relationships loaded successfully', undefined, 'Script');
  } else {
    logger.warn('No relationships in actors.json', undefined, 'Script');
    logger.warn('Generate: npx tsx scripts/init-actor-relationships.ts', undefined, 'Script');
    logger.warn('This updates actors.json with relationship data', undefined, 'Script');
  }

  // Stats
  const stats = {
    actors: await prisma.actor.count(),
    poolActors: await prisma.actor.count({ where: { hasPool: true } }),
    pools: await prisma.pool.count(),
    organizations: await prisma.organization.count(),
    companies: await prisma.organization.count({ where: { type: 'company' } }),
    relationships: await prisma.actorRelationship.count(),
    follows: await prisma.actorFollow.count(),
    posts: await prisma.post.count(),
  };

  logger.info('Database Summary:', {
    actors: `${stats.actors} (${stats.poolActors} traders with pools)`,
    pools: stats.pools,
    organizations: `${stats.organizations} (${stats.companies} companies)`,
    relationships: stats.relationships,
    follows: stats.follows,
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
