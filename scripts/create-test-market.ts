#!/usr/bin/env bun
/**
 * Create a test prediction market
 */

import { prisma } from '../src/lib/prisma';
import { generateSnowflakeId } from '../src/lib/snowflake';
import { Prisma } from '@prisma/client';

async function main() {
  console.log('Creating test prediction market...\n');

  const questionId = generateSnowflakeId();
  const questionNumber = 9999;

  // Create question
  await prisma.question.create({
    data: {
      id: questionId,
      questionNumber,
      text: 'Will the market system verification succeed?',
      scenarioId: 1,
      outcome: true,
      rank: 1,
      resolutionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active',
      updatedAt: new Date(),
    },
  });

  // Create market
  await prisma.market.create({
    data: {
      id: questionId,
      question: 'Will the market system verification succeed?',
      yesShares: new Prisma.Decimal(500),
      noShares: new Prisma.Decimal(500),
      liquidity: new Prisma.Decimal(1000),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  });

  console.log(`✅ Created market ${questionId}`);
  console.log(`   YES: 500 shares`);
  console.log(`   NO: 500 shares`);
  console.log(`   K: 250,000\n`);

  await prisma.$disconnect();
}

main();

