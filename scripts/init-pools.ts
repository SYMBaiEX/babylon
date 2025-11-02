/**
 * Initialize Pools for NPCs with hasPool=true
 * 
 * Creates pool records for all actors marked with hasPool in actors.json
 * and initializes their trading balances
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface Actor {
  id: string;
  name: string;
  description?: string;
  domain?: string[];
  personality?: string;
  tier?: string;
  affiliations?: string[];
  postStyle?: string;
  postExample?: string[];
  role?: string;
  initialLuck?: string;
  initialMood?: number;
  hasPool?: boolean;
}

interface ActorsData {
  actors: Actor[];
}

async function initPools() {
  try {
    console.log('🔄 Loading actors from actors.json...');
    
    // Load actors.json
    const actorsPath = path.join(process.cwd(), 'public', 'data', 'actors.json');
    const actorsData: ActorsData = JSON.parse(fs.readFileSync(actorsPath, 'utf-8'));
    
    // Filter actors with hasPool=true
    const poolActors = actorsData.actors.filter(a => a.hasPool === true);
    
    console.log(`📊 Found ${poolActors.length} actors with pools enabled`);
    
    for (const actor of poolActors) {
      console.log(`\n👤 Processing: ${actor.name} (${actor.id})`);
      
      // 1. Ensure actor exists in database
      let dbActor = await prisma.actor.findUnique({
        where: { id: actor.id },
      });
      
      if (!dbActor) {
        console.log('  ➕ Creating actor in database...');
        dbActor = await prisma.actor.create({
          data: {
            id: actor.id,
            name: actor.name,
            description: actor.description || '',
            domain: actor.domain || [],
            personality: actor.personality,
            tier: actor.tier,
            affiliations: actor.affiliations || [],
            postStyle: actor.postStyle,
            postExample: actor.postExample || [],
            role: actor.role,
            initialLuck: actor.initialLuck || 'medium',
            initialMood: actor.initialMood || 0,
            hasPool: true,
            tradingBalance: new Prisma.Decimal(10000), // Traders start with $10,000
            reputationPoints: 10000, // Trader NPCs start with 10k reputation
          },
        });
      } else {
        // Update existing actor with hasPool and trading balance
        console.log('  🔄 Updating actor...');
        dbActor = await prisma.actor.update({
          where: { id: actor.id },
          data: {
            hasPool: true,
            tradingBalance: new Prisma.Decimal(10000),
            reputationPoints: 10000, // Ensure trader NPCs have high reputation
          },
        });
      }
      
      // 2. Check if pool already exists
      const existingPool = await prisma.pool.findFirst({
        where: {
          npcActorId: actor.id,
        },
      });
      
      if (existingPool) {
        console.log(`  ✅ Pool already exists: ${existingPool.name}`);
        continue;
      }
      
      // 3. Create pool
      const poolName = `${actor.name}'s ${getPoolStyle(actor.personality || 'trader')} Pool`;
      const poolDescription = generatePoolDescription(actor);
      
      console.log(`  🎯 Creating pool: ${poolName}`);
      
      await prisma.pool.create({
        data: {
          npcActorId: actor.id,
          name: poolName,
          description: poolDescription,
          totalValue: new Prisma.Decimal(0),
          totalDeposits: new Prisma.Decimal(0),
          availableBalance: new Prisma.Decimal(0),
          lifetimePnL: new Prisma.Decimal(0),
          performanceFeeRate: 0.08, // 8% performance fee
          totalFeesCollected: new Prisma.Decimal(0),
          isActive: true,
        },
      });
      
      console.log(`  ✅ Pool created successfully!`);
    }
    
    console.log(`\n✨ Pool initialization complete!`);
    console.log(`📈 ${poolActors.length} pools are now active`);
    
  } catch (error) {
    console.error('❌ Error initializing pools:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function getPoolStyle(personality: string): string {
  const styles: Record<string, string> = {
    'activist investor': 'Activist',
    'nft visionary': 'NFT',
    'chart wizard': 'TA',
    'memecoin cultist': 'Meme',
    'TA purist': 'Technical',
    'crypto native': 'Alpha',
    'nft degen': 'Degen',
    'solana maximalist': 'Solana',
    'evangelical investor': 'Innovation',
    'disaster profiteer': 'Inverse',
    'erratic visionary': 'Visionary',
    'bitcoin maximalist': 'Bitcoin',
    'yacht philosopher': 'Wisdom',
    'predatory investor': 'VC',
    'vampire capitalist': 'Contrarian',
  };
  
  return styles[personality.toLowerCase()] || 'Trading';
}

function generatePoolDescription(actor: Actor): string {
  const baseDesc = actor.description || '';
  const strategy = getStrategy(actor.personality || 'trader');
  
  return `${baseDesc.split('.')[0]}. ${strategy} Managed by ${actor.name}.`;
}

function getStrategy(personality: string): string {
  const strategies: Record<string, string> = {
    'activist investor': 'Focuses on event-driven trades and corporate activism',
    'nft visionary': 'Trades NFT and Web3 projects with high conviction',
    'chart wizard': 'Technical analysis-driven with 47-tweet explanations',
    'memecoin cultist': 'Cult dynamics and supercycle theory guide all trades',
    'TA purist': 'Fibonacci levels and textbook patterns only',
    'crypto native': 'Degen wisdom mixed with alpha, probably farming you',
    'nft degen': 'Flips pixels for profit, posts wins only',
    'solana maximalist': 'Solana shilling with 100x conviction',
    'evangelical investor': 'Faith-based innovation investing with 5-year horizons',
    'disaster profiteer': 'Inverse everything, always wrong but confident',
    'erratic visionary': 'Memes at 3am, genius moves eventually',
    'bitcoin maximalist': 'Only Bitcoin, measured in blocks and sats',
    'yacht philosopher': 'Fortune cookie wisdom from the Caymans',
    'predatory investor': 'Software eating everything, TAM obsessed',
    'vampire capitalist': 'Zero to one thinking, contrarian and dark',
  };
  
  return strategies[personality.toLowerCase()] || 'Strategic trading across markets';
}

// Run the script
initPools()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });

