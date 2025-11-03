#!/usr/bin/env bun

/**
 * Seed Predictions
 * 
 * Manually create test prediction market questions
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const testQuestions = [
  {
    text: "Will Bitcoin reach $150,000 by the end of 2025?",
    daysUntilResolution: 90,
  },
  {
    text: "Will there be a major AI breakthrough announced by OpenAI in Q1 2025?",
    daysUntilResolution: 30,
  },
  {
    text: "Will Ethereum complete its next major upgrade within 6 months?",
    daysUntilResolution: 180,
  },
  {
    text: "Will any US tech company reach a $5 trillion market cap this year?",
    daysUntilResolution: 60,
  },
  {
    text: "Will there be a new unicorn company announced in the crypto space this month?",
    daysUntilResolution: 15,
  },
  {
    text: "Will Base chain TVL surpass $10 billion by end of Q1?",
    daysUntilResolution: 45,
  },
  {
    text: "Will Solana have more daily transactions than Ethereum next week?",
    daysUntilResolution: 7,
  },
  {
    text: "Will a major tech company announce layoffs in the next 2 weeks?",
    daysUntilResolution: 14,
  },
];

async function main() {
  console.log('🌱 Seeding predictions...\n');

  // Check if questions already exist
  const existingCount = await prisma.question.count();
  console.log(`📊 Existing questions: ${existingCount}`);

  if (existingCount > 0) {
    console.log('\n⚠️  Questions already exist. Do you want to add more? (continuing...)');
  }

  // Get max questionNumber to continue sequence
  const maxQuestion = await prisma.question.findFirst({
    orderBy: { questionNumber: 'desc' },
    select: { questionNumber: true },
  });
  let questionNumber = (maxQuestion?.questionNumber || 0) + 1;

  let created = 0;
  for (const q of testQuestions) {
    try {
      const resolutionDate = new Date();
      resolutionDate.setDate(resolutionDate.getDate() + q.daysUntilResolution);

      const question = await prisma.question.create({
        data: {
          questionNumber,
          text: q.text,
          status: 'active',
          resolutionDate,
          outcome: Math.random() > 0.5, // Random predetermined outcome
          rank: 1,
          scenarioId: 0, // Default scenario
        },
      });

      // Create corresponding market for LMSR pricing
      await prisma.market.create({
        data: {
          id: question.id,
          question: question.text,
          yesShares: 0,
          noShares: 0,
          liquidity: 1000, // Initial liquidity for LMSR
          resolved: false,
          resolution: null,
          endDate: resolutionDate,
        },
      });

      console.log(`✅ Created: "${q.text.substring(0, 60)}..."`);
      created++;
      questionNumber++; // Increment for next question
    } catch (error) {
      console.error(`❌ Failed to create question: ${error}`);
    }
  }

  console.log(`\n🎉 Seeded ${created} predictions successfully!`);
  console.log(`📈 Total questions: ${existingCount + created}`);
}

main()
  .catch((error) => {
    console.error('❌ Error seeding predictions:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

