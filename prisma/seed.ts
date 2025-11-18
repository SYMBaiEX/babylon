#!/usr/bin/env bun

/**
 * Database Seed Script
 * 
 * Seeds the database with:
 * - All actors from split JSON structure (public/data/actors/*.json)
 * - All organizations from split JSON structure (public/data/organizations/*.json)
 * - Initial game state
 * 
 * Run: bun run prisma:seed
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../src/lib/logger';
import { generateSnowflakeId } from '../src/lib/snowflake';
import { loadActorsData } from '../src/lib/data/actors-loader';

const prisma = new PrismaClient();

import type { SeedActorsDatabase } from '../src/shared/types';

async function main() {
  logger.info('SEEDING DATABASE', undefined, 'Script');

  // Load actors data from new split structure
  const actorsData: SeedActorsDatabase = loadActorsData();

  logger.info('Loaded:', {
    actors: actorsData.actors.length,
    organizations: actorsData.organizations.length
  }, 'Script');

  // Seed actors
  logger.info('Seeding actors...', undefined, 'Script');
  
  // Create actors individually (Prisma Accelerate limitation with array fields)
  for (const actor of actorsData.actors) {
    const imagePath = join(process.cwd(), 'public', 'images', 'actors', `${actor.id}.jpg`);
    const profileImageUrl = existsSync(imagePath) ? `/images/actors/${actor.id}.jpg` : null;
    
    // Randomize trading balance based on tier
    // S_TIER: $500k-$1M, A_TIER: $250k-$500k, B_TIER: $100k-$250k, C_TIER: $100k-$200k
    let minBalance = 100000;
    let maxBalance = 200000;
    
    if (actor.tier === 'S_TIER') {
      minBalance = 500000;
      maxBalance = 1000000;
    } else if (actor.tier === 'A_TIER') {
      minBalance = 250000;
      maxBalance = 500000;
    } else if (actor.tier === 'B_TIER') {
      minBalance = 100000;
      maxBalance = 250000;
    }
    
    const tradingBalance = Math.floor(Math.random() * (maxBalance - minBalance) + minBalance);
    
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
        tradingBalance: new Prisma.Decimal(tradingBalance),
        reputationPoints: 1000,
        profileImageUrl: profileImageUrl,
        updatedAt: new Date(),
      },
    }).catch((error: unknown) => {
      // Skip if actor already exists (P2002 = unique constraint violation)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return; // Skip duplicate
      }
      throw error;
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
    
    // Check if organization image exists
    const orgImagePath = join(process.cwd(), 'public', 'images', 'organizations', `${org.id}.jpg`);
    const imageUrl = existsSync(orgImagePath) ? `/images/organizations/${org.id}.jpg` : null;
    
    await prisma.organization.upsert({
      where: { id: org.id },
      update: {
        name: org.name,
        ticker: org.ticker || null,
        description: org.description || '',
        type: org.type,
        canBeInvolved: org.canBeInvolved !== false,
        initialPrice: org.initialPrice || null,
        currentPrice: org.initialPrice || null,
        imageUrl: imageUrl,
        updatedAt: new Date(),
      },
      create: {
        id: org.id,
        name: org.name,
        ticker: org.ticker || null,
        description: org.description || '',
        type: org.type,
        canBeInvolved: org.canBeInvolved !== false,
        initialPrice: org.initialPrice || null,
        currentPrice: org.initialPrice || null,
        imageUrl: imageUrl,
        updatedAt: new Date(),
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
    const now = new Date();
    const gameId = await generateSnowflakeId();
    try {
      await prisma.game.create({
        data: {
          id: gameId,
          isContinuous: true,
          isRunning: true, // Game starts running by default
          currentDate: now,
          currentDay: 1,
          speed: 60000,
          startedAt: now, // Set startedAt timestamp
          updatedAt: now,
        },
      });
      logger.info('✅ Game state initialized (RUNNING)', undefined, 'Script');
    } catch (error: unknown) {
      // If game already exists (race condition), just log and continue
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        logger.info('✅ Game state already exists', undefined, 'Script');
      } else {
        throw error;
      }
    }
  } else {
    // If game exists but is paused, start it
    if (!existingGame.isRunning) {
      await prisma.game.update({
        where: { id: existingGame.id },
        data: {
          isRunning: true,
          startedAt: existingGame.startedAt || new Date(),
          pausedAt: null,
        },
      });
      logger.info('✅ Game state updated to RUNNING', undefined, 'Script');
    } else {
      logger.info('✅ Game state already exists and is RUNNING', undefined, 'Script');
    }
  }
  
  // Generate initial NPC investments
  // NPCs should start with existing positions in companies they'd naturally invest in
  logger.info('Generating initial NPC investments...', undefined, 'Script');
  
  try {
    const { InitialInvestmentService } = await import('../src/lib/services/initial-investment-service');
    const investmentResult = await InitialInvestmentService.generateAndExecuteInitialInvestments();
    
    logger.info('✅ Initial NPC investments complete', {
      npcs: investmentResult.totalNPCs,
      investments: investmentResult.totalInvestments,
      volume: `$${(investmentResult.totalVolume / 1000000).toFixed(1)}M`
    }, 'Script');
  } catch (error) {
    logger.warn('Failed to generate initial investments (will use default balances)', {
      error: error instanceof Error ? error.message : String(error)
    }, 'Script');
  }
  
  // NOTE: Relationships are now DYNAMIC and generated by the game engine
  // We no longer seed static relationships from JSON files
  logger.info('Relationships are dynamically generated by the game engine', undefined, 'Script');
  logger.info('Initial relationships will be created on first game tick', undefined, 'Script');
  
  // Initialize NPC-to-NPC follows from existing relationships if any
  logger.info('Checking NPC-to-NPC follow relationships...', undefined, 'Script');
  const existingFollows = await prisma.actorFollow.count();
  const existingRelationships = await prisma.actorRelationship.count();
  
  if (existingFollows === 0 && existingRelationships > 0) {
    logger.info('Creating follows from existing relationships...', undefined, 'Script');
    
    try {
      // Get all relationships and create follow records
      const relationships = await prisma.actorRelationship.findMany();
      let followsCreated = 0;
      
      for (const rel of relationships) {
        // Positive relationships = mutual follows
        if (rel.sentiment > 0.3) {
          // Actor 1 follows Actor 2
          await prisma.actorFollow.upsert({
            where: {
              followerId_followingId: {
                followerId: rel.actor1Id,
                followingId: rel.actor2Id,
              },
            },
            update: {},
            create: {
              id: await generateSnowflakeId(),
              followerId: rel.actor1Id,
              followingId: rel.actor2Id,
              isMutual: true,
            },
          });
          
          // Actor 2 follows Actor 1
          await prisma.actorFollow.upsert({
            where: {
              followerId_followingId: {
                followerId: rel.actor2Id,
                followingId: rel.actor1Id,
              },
            },
            update: {},
            create: {
              id: await generateSnowflakeId(),
              followerId: rel.actor2Id,
              followingId: rel.actor1Id,
              isMutual: true,
            },
          });
          
          followsCreated += 2;
        }
        // Rivals = they follow each other to keep tabs
        else if (rel.relationshipType === 'rivals' || rel.relationshipType === 'competitors') {
          await prisma.actorFollow.upsert({
            where: {
              followerId_followingId: {
                followerId: rel.actor1Id,
                followingId: rel.actor2Id,
              },
            },
            update: {},
            create: {
              id: await generateSnowflakeId(),
              followerId: rel.actor1Id,
              followingId: rel.actor2Id,
              isMutual: false,
            },
          });
          
          await prisma.actorFollow.upsert({
            where: {
              followerId_followingId: {
                followerId: rel.actor2Id,
                followingId: rel.actor1Id,
              },
            },
            update: {},
            create: {
              id: await generateSnowflakeId(),
              followerId: rel.actor2Id,
              followingId: rel.actor1Id,
              isMutual: false,
            },
          });
          
          followsCreated += 2;
        }
      }
      
      logger.info(`✅ Created ${followsCreated} follows from relationships`, { count: followsCreated }, 'Script');
    } catch (error) {
      logger.error('Failed to create follows', { error }, 'Script');
    }
  } else if (existingFollows > 0) {
    logger.info(`Found ${existingFollows} existing NPC follow relationships`, { count: existingFollows }, 'Script');
  } else {
    logger.info('No relationships yet - will be generated on first game tick', undefined, 'Script');
  }

  // Seed default real users for DM testing
  logger.info('Seeding default real users for DM testing...', undefined, 'Script');
  
  const defaultUsers = [
    {
      id: 'demo-user-babylon-support',
      privyId: 'did:privy:babylon-support-demo',
      username: 'babylon-support',
      displayName: 'Babylon Support',
      bio: 'Official Babylon support account. Send us a message if you need help!',
      profileImageUrl: '/assets/user-profiles/profile-1.jpg',
      isActor: false,
      profileComplete: true,
      hasUsername: true,
      hasBio: true,
      hasProfileImage: true,
      reputationPoints: 5000,
      updatedAt: new Date(),
    },
    {
      id: 'demo-user-welcome-bot',
      privyId: 'did:privy:babylon-welcome-bot',
      username: 'welcome-bot',
      displayName: 'Welcome Bot',
      bio: 'New to Babylon? Message me to learn how to play!',
      profileImageUrl: '/assets/user-profiles/profile-2.jpg',
      isActor: false,
      profileComplete: true,
      hasUsername: true,
      hasBio: true,
      hasProfileImage: true,
      reputationPoints: 3000,
      updatedAt: new Date(),
    },
  ];

  let usersCreated = 0;
  for (const userData of defaultUsers) {
    await prisma.user.upsert({
      where: { id: userData.id },
      update: {
        username: userData.username,
        displayName: userData.displayName,
        bio: userData.bio,
        profileImageUrl: userData.profileImageUrl,
        profileComplete: userData.profileComplete,
        hasUsername: userData.hasUsername,
        hasBio: userData.hasBio,
        hasProfileImage: userData.hasProfileImage,
        reputationPoints: userData.reputationPoints,
      },
      create: userData,
    });
    usersCreated++;
  }

  logger.info(`Created/updated ${usersCreated} default real users for DM testing`, undefined, 'Script');

  // NOTE: World facts are now seeded via seed-world-facts.ts
  // Run: bun run prisma/seed-world-facts.ts
  logger.info('World facts seeding handled by seed-world-facts.ts', undefined, 'Script');

  // Stats
  const stats = {
    actors: await prisma.actor.count(),
    organizations: await prisma.organization.count(),
    companies: await prisma.organization.count({ where: { type: 'company' } }),
    relationships: await prisma.actorRelationship.count(),
    actorFollows: await prisma.actorFollow.count(),
    userActorFollows: await prisma.userActorFollow.count(),
    userFollows: await prisma.follow.count(),
    posts: await prisma.post.count(),
    realUsers: await prisma.user.count({ where: { isActor: false } }),
    worldFacts: await prisma.worldFact.count(),
  };

  logger.info('Database Summary:', {
    actors: stats.actors,
    organizations: `${stats.organizations} (${stats.companies} companies)`,
    relationships: stats.relationships,
    npcFollows: `${stats.actorFollows} (NPC-to-NPC)`,
    userActorFollows: `${stats.userActorFollows} (User-to-NPC)`,
    userFollows: `${stats.userFollows} (User-to-User)`,
    posts: stats.posts,
    realUsers: stats.realUsers,
    worldFacts: stats.worldFacts,
  }, 'Script');

  logger.info('SEED COMPLETE', undefined, 'Script');
}

main()
  .then(() => {
    logger.info('✅ Seed completed successfully', undefined, 'Script');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('❌ Seed failed', { error }, 'Script');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
