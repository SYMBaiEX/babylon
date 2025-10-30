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

const prisma = new PrismaClient();

interface ActorsDatabase {
  actors: any[];
  organizations: any[];
}

async function main() {
  console.log('\n🌱 SEEDING DATABASE\n');

  // Load actors.json
  const actorsPath = join(process.cwd(), 'data', 'actors.json');
  const actorsData: ActorsDatabase = JSON.parse(readFileSync(actorsPath, 'utf-8'));

  console.log(`📋 Loaded:
   • ${actorsData.actors.length} actors
   • ${actorsData.organizations.length} organizations\n`);

  // Seed actors
  console.log('👥 Seeding actors...');
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
  console.log(`  ✓ Seeded ${actorsData.actors.length} actors\n`);

  // Seed organizations
  console.log('🏢 Seeding organizations...');
  let orgCount = 0;
  for (const org of actorsData.organizations) {
    // Skip if missing required fields
    if (!org.id || !org.name || !org.type) {
      console.warn(`  ⚠️  Skipping org "${org.id || 'unknown'}" - missing required fields`);
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
  console.log(`  ✓ Seeded ${orgCount} organizations\n`);

  // Initialize game state
  console.log('🎮 Initializing game state...');
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
    console.log('  ✓ Game state initialized\n');
  } else {
    console.log('  ✓ Game state already exists\n');
  }

  // Stats
  const stats = {
    actors: await prisma.actor.count(),
    organizations: await prisma.organization.count(),
    companies: await prisma.organization.count({ where: { type: 'company' } }),
    posts: await prisma.post.count(),
  };

  console.log('📊 Database Summary:');
  console.log(`   Actors: ${stats.actors}`);
  console.log(`   Organizations: ${stats.organizations} (${stats.companies} companies)`);
  console.log(`   Posts: ${stats.posts}\n`);

  console.log('✅ SEED COMPLETE\n');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
