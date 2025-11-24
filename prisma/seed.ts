#!/usr/bin/env bun

/**
 * Database Seed Script
 * 
 * Seeds the database with:
 * - All actors from split JSON structure (public/data/actors/*.json)
 * - All organizations from split JSON structure (public/data/organizations/*.json)
 * - Initial game state
 * - World facts and RSS feeds
 * - Character and organization mappings
 * 
 * Run: bun run prisma:seed
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../src/lib/logger';
import { generateSnowflakeId } from '../src/lib/snowflake';
import { loadActorsData } from '../src/lib/data/actors-loader';

const prisma = new PrismaClient();

import type { SeedActorsDatabase } from '../src/shared/types';

// --- Helper Functions ---

/**
 * Generate a key from a value string (for database lookup)
 */
function generateKey(value: string): string {
  // Extract first meaningful part (before colon or first sentence)
  let keyPart = value.split(':')[0].trim();
  if (keyPart.length > 50) {
    keyPart = keyPart.split('.')[0].trim();
  }
  
  // Convert to snake_case
  return keyPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}

/**
 * Generate a label from a value string
 */
function generateLabel(value: string): string {
  // Extract first part before colon, or first sentence
  const beforeColon = value.split(':')[0].trim();
  if (beforeColon.length <= 60 && beforeColon.length > 0) {
    return beforeColon;
  }
  
  // Otherwise use first sentence
  const firstSentence = value.split('.')[0].trim();
  if (firstSentence.length <= 60) {
    return firstSentence;
  }
  
  // Fallback: truncate
  return value.substring(0, 60).trim();
}

/**
 * Parse facts from markdown file
 */
function parseFactsFromMarkdown(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const facts: string[] = [];

  // Parse markdown: extract lines that start with - or * (markdown list items)
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, headers, and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--')) {
      continue;
    }
    // Extract list items (lines starting with - or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const fact = trimmed.substring(2).trim();
      if (fact) {
        facts.push(fact);
      }
    }
  }

  return facts;
}

/**
 * Map actor domain to category for character mappings
 */
function mapDomainToCategory(domains: string[] | undefined): string {
  if (!domains || domains.length === 0) {
    return 'general';
  }
  
  // Priority order: crypto > politics > tech > others
  if (domains.includes('crypto')) {
    return 'crypto';
  }
  if (domains.includes('politics') || domains.includes('government')) {
    return 'politics';
  }
  if (domains.includes('tech') || domains.includes('ai') || domains.includes('technology')) {
    return 'tech';
  }
  
  // Return first domain as fallback
  return domains[0] || 'general';
}

/**
 * Map actor tier to priority number
 */
function mapTierToPriority(tier: string | undefined): number {
  switch (tier) {
    case 'S_TIER':
      return 100;
    case 'A_TIER':
      return 90;
    case 'B_TIER':
      return 80;
    case 'C_TIER':
      return 70;
    default:
      return 50;
  }
}

/**
 * Generate aliases from actor data
 */
function generateAliases(actor: { firstName?: string; lastName?: string; originalLastName?: string; username?: string }): string[] {
  const aliases: string[] = [];
  
  // Add parody last name as alias
  if (actor.lastName) {
    aliases.push(actor.lastName);
  }
  
  // Add original last name if different from parody last name
  if (actor.originalLastName && actor.originalLastName !== actor.lastName) {
    aliases.push(actor.originalLastName);
  }
  
  return aliases;
}

/**
 * Map organization type to category
 */
function mapOrgTypeToCategory(orgType: string | undefined): string {
  switch (orgType) {
    case 'company':
      return 'tech';
    case 'media':
      return 'media';
    case 'government':
      return 'government';
    default:
      return 'general';
  }
}

/**
 * Determine organization priority based on name/importance
 */
function getOrganizationPriority(orgName: string, orgType: string | undefined): number {
  // Major tech companies get higher priority
  const majorTechOrgs = ['OpenAGI', 'Meta', 'Google', 'Microsoft', 'Apple', 'Amazon', 'Tesla', 'Twitter', 'Anthropic', 'NVIDIA'];
  if (majorTechOrgs.some(name => orgName.toLowerCase().includes(name.toLowerCase()))) {
    return 100;
  }
  
  // Major crypto orgs
  const majorCryptoOrgs = ['Binance', 'Coinbase', 'Ethereum'];
  if (majorCryptoOrgs.some(name => orgName.toLowerCase().includes(name.toLowerCase()))) {
    return 90;
  }
  
  // Major media
  const majorMedia = ['New York Times', 'Washington Post', 'Wall Street Journal', 'CNN', 'Fox News', 'Bloomberg'];
  if (majorMedia.some(name => orgName.toLowerCase().includes(name.toLowerCase()))) {
    return 85;
  }
  
  // Government orgs
  if (orgType === 'government') {
    return 80;
  }
  
  // Default priority
  return 70;
}

// --- Seeding Functions ---

async function seedWorldFacts() {
  logger.info('Seeding world facts...', undefined, 'SeedWorldFacts');

  const dataDir = join(process.cwd(), 'data');
  
  // Load world facts from markdown file
  const worldFacts = parseFactsFromMarkdown(join(dataDir, 'world-facts.md'));
  
  if (worldFacts.length === 0) {
    logger.warn('No facts found in data/world-facts.md', undefined, 'SeedWorldFacts');
    return;
  }

  // Seed world facts (category: 'general')
  for (const value of worldFacts) {
    const key = generateKey(value);
    const label = generateLabel(value);

    await prisma.worldFact.upsert({
      where: { category_key: { category: 'general', key } },
      create: {
        id: await generateSnowflakeId(),
        category: 'general',
        key,
        label,
        value,
        source: 'default',
        priority: 0,
        lastUpdated: new Date(),
      },
      update: {
        label,
        value,
        lastUpdated: new Date(),
      },
    });
  }

  logger.info(`Seeded ${worldFacts.length} world facts`, undefined, 'SeedWorldFacts');
}

async function seedRSSFeeds() {
  logger.info('Seeding RSS feeds...', undefined, 'SeedRSSFeeds');

  const rssFeeds = [
    {
      name: 'New York Times - Technology',
      feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
      category: 'tech',
    },
    {
      name: 'New York Times - Business',
      feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
      category: 'business',
    },
    {
      name: 'LA Times - Technology',
      feedUrl: 'https://www.latimes.com/business/technology/rss2.0.xml',
      category: 'tech',
    },
    {
      name: 'TechCrunch',
      feedUrl: 'https://techcrunch.com/feed/',
      category: 'tech',
    },
    {
      name: 'Ars Technica',
      feedUrl: 'https://feeds.arstechnica.com/arstechnica/index',
      category: 'tech',
    },
    {
      name: 'The Verge',
      feedUrl: 'https://www.theverge.com/rss/index.xml',
      category: 'tech',
    },
    {
      name: 'Wired',
      feedUrl: 'https://www.wired.com/feed/rss',
      category: 'tech',
    },
    {
      name: 'CoinDesk',
      feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      category: 'crypto',
    },
    {
      name: 'Cointelegraph',
      feedUrl: 'https://cointelegraph.com/rss',
      category: 'crypto',
    },
    {
      name: 'BBC - Technology',
      feedUrl: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
      category: 'tech',
    },
  ];

  for (const feed of rssFeeds) {
    // Check if feed already exists by URL
    const existing = await prisma.rSSFeedSource.findFirst({
      where: { feedUrl: feed.feedUrl },
    });

    if (existing) {
      await prisma.rSSFeedSource.update({
        where: { id: existing.id },
        data: feed,
      });
    } else {
      await prisma.rSSFeedSource.create({
        data: {
          id: await generateSnowflakeId(),
          ...feed,
        },
      });
    }
  }

  logger.info(`Seeded ${rssFeeds.length} RSS feeds`, undefined, 'SeedRSSFeeds');
}

async function seedCharacterMappings(actors: any[]) {
  logger.info('Seeding character mappings...', undefined, 'SeedCharacterMappings');

  let seededCount = 0;

  for (const actor of actors) {
    // Skip if actor doesn't have realName (required for mapping)
    if (!actor.realName) {
      // Some actors might not have realName, that's okay, just skip mapping
      continue;
    }

    const category = mapDomainToCategory(actor.domain);
    const priority = mapTierToPriority(actor.tier);
    
    const aliases = generateAliases(actor);

    await prisma.characterMapping.upsert({
      where: { realName: actor.realName },
      create: {
        id: await generateSnowflakeId(),
        realName: actor.realName,
        parodyName: actor.name,
        category,
        aliases,
        priority,
      },
      update: {
        parodyName: actor.name,
        category,
        aliases,
        priority,
      },
    });

    seededCount++;
  }

  logger.info(`Seeded ${seededCount} character mappings`, undefined, 'SeedCharacterMappings');
}

async function seedOrganizationMappings(organizations: any[]) {
  logger.info('Seeding organization mappings...', undefined, 'SeedOrganizationMappings');

  let seededCount = 0;

  for (const org of organizations) {
    // Skip if organization doesn't have originalName (required for mapping)
    if (!org.originalName) {
      continue;
    }

    const category = mapOrgTypeToCategory(org.type);
    const priority = getOrganizationPriority(org.originalName, org.type);
    const aliases: string[] = [];
    
    // Add originalHandle as alias if it exists and is different from name
    if (org.originalHandle && org.originalHandle !== org.name.toLowerCase()) {
      aliases.push(org.originalHandle);
    }

    await prisma.organizationMapping.upsert({
      where: { realName: org.originalName },
      create: {
        id: await generateSnowflakeId(),
        realName: org.originalName,
        parodyName: org.name,
        category,
        aliases,
        priority,
      },
      update: {
        parodyName: org.name,
        category,
        aliases,
        priority,
      },
    });

    seededCount++;
  }

  logger.info(`Seeded ${seededCount} organization mappings`, undefined, 'SeedOrganizationMappings');
}

// --- Main ---

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

  // Seed World Facts & Mappings
  await seedWorldFacts();
  await seedRSSFeeds();
  await seedCharacterMappings(actorsData.actors);
  await seedOrganizationMappings(actorsData.organizations);

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
    rssFeeds: await prisma.rSSFeedSource.count(),
    characterMappings: await prisma.characterMapping.count(),
    organizationMappings: await prisma.organizationMapping.count(),
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
    rssFeeds: stats.rssFeeds,
    characterMappings: stats.characterMappings,
    organizationMappings: stats.organizationMappings,
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
