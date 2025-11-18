/**
 * Seed World Facts
 * 
 * Initializes default world facts, RSS feed sources, and character/organization mappings
 * Character and organization mappings are loaded from JSON files (single source of truth)
 */

import { prisma } from '../src/lib/prisma';
import { generateSnowflakeId } from '../src/lib/snowflake';
import { logger } from '../src/lib/logger';
import { loadActorsData } from '../src/lib/data/actors-loader';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  try {
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
  } catch (error) {
    logger.error(`Failed to read ${filePath}, using empty array`, { error }, 'SeedWorldFacts');
    return [];
  }
}

async function seedWorldFacts() {
  logger.info('Seeding world facts...', undefined, 'SeedWorldFacts');

  const dataDir = join(process.cwd(), 'data');
  
  // Load world facts from markdown file
  const worldFacts = parseFactsFromMarkdown(join(dataDir, 'world-facts.md'));
  
  // Load reality grounding facts from markdown file
  const realityGroundingFacts = parseFactsFromMarkdown(join(dataDir, 'reality-grounding.md'));

  if (worldFacts.length === 0 && realityGroundingFacts.length === 0) {
    logger.warn('No facts found in data/world-facts.md or data/reality-grounding.md', undefined, 'SeedWorldFacts');
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

  // Seed reality grounding facts (category: 'reality-grounding')
  for (const value of realityGroundingFacts) {
    const key = generateKey(value);
    const label = generateLabel(value);

    await prisma.worldFact.upsert({
      where: { category_key: { category: 'reality-grounding', key } },
      create: {
        id: await generateSnowflakeId(),
        category: 'reality-grounding',
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

  logger.info(`Seeded ${worldFacts.length} world facts and ${realityGroundingFacts.length} reality grounding facts`, undefined, 'SeedWorldFacts');
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
      name: 'Reuters - Technology',
      feedUrl: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
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

async function seedCharacterMappings() {
  logger.info('Seeding character mappings...', undefined, 'SeedCharacterMappings');

  // Load actors from JSON files (single source of truth)
  const { actors } = loadActorsData({ includeActors: true, includeOrganizations: false, includeRelationships: false });

  let seededCount = 0;

  for (const actor of actors) {
    // Skip if actor doesn't have realName (required for mapping)
    if (!actor.realName) {
      logger.warn(`Actor ${actor.id} missing realName, skipping character mapping`, undefined, 'SeedCharacterMappings');
      continue;
    }

    const category = mapDomainToCategory(actor.domain);
    const priority = mapTierToPriority(actor.tier);
    
    // Access firstName/lastName fields that may exist in JSON but not in TypeScript type
    const actorWithNames = actor as typeof actor & { firstName?: string; lastName?: string };
    const aliases = generateAliases(actorWithNames);

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

  logger.info(`Seeded ${seededCount} character mappings from ${actors.length} actors`, undefined, 'SeedCharacterMappings');
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
 * This is a simple heuristic - can be enhanced later
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

async function seedOrganizationMappings() {
  logger.info('Seeding organization mappings...', undefined, 'SeedOrganizationMappings');

  // Load organizations from JSON files (single source of truth)
  const { organizations } = loadActorsData({ includeActors: false, includeOrganizations: true, includeRelationships: false });

  let seededCount = 0;

  for (const org of organizations) {
    // Skip if organization doesn't have originalName (required for mapping)
    if (!org.originalName) {
      logger.warn(`Organization ${org.id} missing originalName, skipping organization mapping`, undefined, 'SeedOrganizationMappings');
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

  logger.info(`Seeded ${seededCount} organization mappings from ${organizations.length} organizations`, undefined, 'SeedOrganizationMappings');
}

async function main() {
  try {
    await seedWorldFacts();
    await seedRSSFeeds();
    await seedCharacterMappings();
    await seedOrganizationMappings();
    
    logger.info('✅ World facts seed complete!', undefined, 'SeedWorldFacts');
  } catch (error) {
    logger.error('Failed to seed world facts', { error }, 'SeedWorldFacts');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

