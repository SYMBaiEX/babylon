/**
 * Collect Game Data for HuggingFace
 * 
 * Collects ALL generated game data for upload to HuggingFace:
 * - Complete game worlds (questions, events, NPCs, timelines, feed posts)
 * - Agent trajectories (decisions, actions, outcomes)
 * - Benchmark results (model performance)
 * - Organized by month/year for easy browsing
 * 
 * This creates a comprehensive dataset that can be downloaded and used
 * for offline faster-than-real-time simulation.
 */

import { prisma } from '../src/lib/prisma';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../src/lib/logger';

interface GameDataCollection {
  metadata: {
    collectedAt: string;
    version: string;
    totalWorlds: number;
    totalTrajectories: number;
    totalBenchmarks: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
  gameWorlds: GameWorldData[];
  trajectories: TrajectoryData[];
  benchmarks: BenchmarkData[];
}

interface GameWorldData {
  worldId: string;
  generatedAt: string;
  month: string;  // YYYY-MM
  question: string;
  outcome: boolean;
  timeline: DayData[];
  npcs: NPCData[];
  events: EventData[];
  feedPosts: FeedPostData[];
  metadata: Record<string, unknown>;
}

interface DayData {
  day: number;
  date: string;
  summary: string;
  events: string[];
  sentiment: number;
  feedPostCount: number;
}

interface NPCData {
  id: string;
  name: string;
  role: string;
  reliability: number;
}

interface EventData {
  type: string;
  day: number;
  description: string;
  isPublic: boolean;
  sentiment: number;
}

interface FeedPostData {
  id: string;
  author: string;
  content: string;
  day: number;
  timestamp: number;
  likes: number;
  comments: number;
}

interface TrajectoryData {
  trajectoryId: string;
  agentId: string;
  month: string;
  scenario: string;
  steps: unknown[];
  totalReward: number;
  finalPnL: number;
  metrics: Record<string, unknown>;
}

interface BenchmarkData {
  benchmarkId: string;
  modelId: string;
  month: string;
  metrics: Record<string, unknown>;
}

async function collectGameWorlds(): Promise<GameWorldData[]> {
  logger.info('Collecting game worlds...');
  
  const worlds: GameWorldData[] = [];
  
  // Scan public/data/ directory for saved world files
  const dataDir = path.join(process.cwd(), 'public', 'data');
  try {
    const files = await fs.readdir(dataDir);
    
    for (const file of files) {
      if (file.startsWith('world-') && file.endsWith('.json')) {
        try {
          const worldPath = path.join(dataDir, file);
          const worldData = JSON.parse(await fs.readFile(worldPath, 'utf-8'));
          
          if (worldData.question && worldData.timeline) {
            const createdDate = worldData.generatedAt || new Date().toISOString();
            worlds.push({
              worldId: worldData.worldId || file.replace('.json', ''),
              generatedAt: createdDate,
              month: createdDate.substring(0, 7),
              question: worldData.question,
              outcome: worldData.outcome ?? true,
              timeline: worldData.timeline || [],
              npcs: worldData.npcs || [],
              events: worldData.events || [],
              feedPosts: worldData.feedPosts || [],
              metadata: worldData.metadata || {},
            });
          }
        } catch (error) {
          logger.warn(`Failed to load world file: ${file}`, { error });
        }
      }
    }
    
    logger.info(`Found ${worlds.length} game worlds from saved files`);
  } catch (error) {
    logger.warn('Could not scan data directory for worlds', { error });
  }
  
  // Check database for game histories (stored when games are generated)
  try {
    const gameConfigs = await prisma.gameConfig.findMany({
      where: {
        key: { startsWith: 'game-history-' },
      },
      take: 100,  // Limit for memory safety
    });
    
    for (const config of gameConfigs) {
      const data = config.value as {
        game?: {
          setup?: {
            questions?: Array<{ text: string; outcome: boolean }>;
          };
        };
      };
      
      if (data.game?.setup?.questions) {
        // Extract questions from game history
        for (const question of data.game.setup.questions) {
          const createdDate = config.createdAt.toISOString();
          worlds.push({
            worldId: `game-${config.id}`,
            generatedAt: createdDate,
            month: createdDate.substring(0, 7),
            question: question.text,
            outcome: question.outcome,
            timeline: [],  // Not stored in game config, just metadata
            npcs: [],
            events: [],
            feedPosts: [],
            metadata: {
              source: 'gameConfig',
              type: 'generated',
              gameId: config.id,
            },
          });
        }
      }
    }
    
    logger.info(`Found ${worlds.length} total game worlds`);
  } catch (error) {
    logger.warn('Could not load game worlds from database', { error });
  }
  
  return worlds;
}

async function collectTrajectories(since?: Date): Promise<TrajectoryData[]> {
  logger.info('Collecting trajectories...');
  
  // MEMORY SAFETY: Collect in batches to avoid OOM
  const BATCH_SIZE = 100;  // Process 100 at a time
  const MAX_TOTAL = 1000;  // Max 1000 total to prevent OOM
  
  const trajectories: TrajectoryData[] = [];
  let skip = 0;
  let hasMore = true;
  
  while (hasMore && trajectories.length < MAX_TOTAL) {
    const batch = await prisma.trajectory.findMany({
      where: {
        isTrainingData: true,
        createdAt: since ? { gte: since } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: BATCH_SIZE,
      select: {
        trajectoryId: true,
        agentId: true,
        scenarioId: true,
        stepsJson: true,
        metricsJson: true,
        metadataJson: true,
        totalReward: true,
        finalPnL: true,
        createdAt: true,
      },
    });
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    // Parse and add to collection (one at a time to manage memory)
    for (const t of batch) {
      try {
        trajectories.push({
          trajectoryId: t.trajectoryId,
          agentId: t.agentId,
          month: t.createdAt.toISOString().substring(0, 7),
          scenario: t.scenarioId || 'default',
          steps: JSON.parse(t.stepsJson),
          totalReward: t.totalReward,
          finalPnL: t.finalPnL || 0,
          metrics: JSON.parse(t.metricsJson),
        });
      } catch (error) {
        logger.warn('Failed to parse trajectory', { trajectoryId: t.trajectoryId, error });
      }
    }
    
    skip += BATCH_SIZE;
    logger.info(`Collected ${trajectories.length} trajectories so far...`);
    
    // Force garbage collection hint
    if (global.gc) global.gc();
  }
  
  logger.info(`Found ${trajectories.length} trajectories (limited to ${MAX_TOTAL} for memory safety)`);
  
  return trajectories;
}

async function collectBenchmarks(): Promise<BenchmarkData[]> {
  logger.info('Collecting benchmarks...');
  
  // MEMORY SAFETY: Limit to reasonable size
  const MAX_BENCHMARKS = 500;
  
  const benchmarks = await prisma.benchmarkResult.findMany({
    orderBy: { createdAt: 'desc' },
    take: MAX_BENCHMARKS,
  });
  
  logger.info(`Found ${benchmarks.length} benchmarks (limited to ${MAX_BENCHMARKS})`);
  
  return benchmarks.map(b => ({
    benchmarkId: b.benchmarkId,
    modelId: b.modelId,
    month: b.createdAt.toISOString().substring(0, 7),
    metrics: b.detailedMetrics as Record<string, unknown>,
  }));
}

function organizeByMonth<T extends { month: string }>(data: T[]): Record<string, T[]> {
  const organized: Record<string, T[]> = {};
  
  for (const item of data) {
    if (!organized[item.month]) {
      organized[item.month] = [];
    }
    organized[item.month]!.push(item);
  }
  
  return organized;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║    COLLECTING GAME DATA FOR HUGGINGFACE                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const startTime = Date.now();
  
  // Collect all data
  const gameWorlds = await collectGameWorlds();
  const trajectories = await collectTrajectories();
  const benchmarks = await collectBenchmarks();
  
  // Organize by month
  const worldsByMonth = organizeByMonth(gameWorlds);
  const trajectoriesByMonth = organizeByMonth(trajectories);
  const benchmarksByMonth = organizeByMonth(benchmarks);
  
  // Get date range
  const allDates = [
    ...trajectories.map(t => t.month),
    ...benchmarks.map(b => b.month),
    ...gameWorlds.map(w => w.month),
  ].sort();
  
  const collection: GameDataCollection = {
    metadata: {
      collectedAt: new Date().toISOString(),
      version: '1.0.0',
      totalWorlds: gameWorlds.length,
      totalTrajectories: trajectories.length,
      totalBenchmarks: benchmarks.length,
      dateRange: {
        start: allDates[0] || new Date().toISOString().substring(0, 7),
        end: allDates[allDates.length - 1] || new Date().toISOString().substring(0, 7),
      },
    },
    gameWorlds,
    trajectories,
    benchmarks,
  };
  
  // Save to organized structure
  const outputDir = path.join(process.cwd(), 'exports', 'huggingface', 'latest');
  await fs.mkdir(outputDir, { recursive: true });
  
  // MEMORY SAFETY: Don't save everything in one huge JSON file
  // Instead save metadata only
  await fs.writeFile(
    path.join(outputDir, 'index.json'),
    JSON.stringify(collection.metadata, null, 2)
  );
  
  // MEMORY SAFETY: Save by month in separate files (streaming approach)
  const monthsDir = path.join(outputDir, 'by-month');
  await fs.mkdir(monthsDir, { recursive: true });
  
  const allMonths = new Set([
    ...Object.keys(worldsByMonth),
    ...Object.keys(trajectoriesByMonth),
    ...Object.keys(benchmarksByMonth),
  ]);
  
  for (const month of allMonths) {
    // Save each month's data separately (prevents huge memory usage)
    const monthData = {
      month,
      worlds: worldsByMonth[month] || [],
      trajectories: trajectoriesByMonth[month] || [],
      benchmarks: benchmarksByMonth[month] || [],
    };
    
    // Write to file immediately (don't keep in memory)
    await fs.writeFile(
      path.join(monthsDir, `${month}.json`),
      JSON.stringify(monthData, null, 2)
    );
    
    logger.info(`Saved ${month} data (${(worldsByMonth[month] || []).length} worlds, ${(trajectoriesByMonth[month] || []).length} trajectories)`);
  }
  
  // Save separate JSONL files for large datasets (better for memory)
  await fs.writeFile(
    path.join(outputDir, 'trajectories.jsonl'),
    trajectories.map(t => JSON.stringify(t)).join('\n')
  );
  
  await fs.writeFile(
    path.join(outputDir, 'benchmarks.jsonl'),
    benchmarks.map(b => JSON.stringify(b)).join('\n')
  );
  
  // Save summary
  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(collection.metadata, null, 2)
  );
  
  const duration = Date.now() - startTime;
  
  console.log('\n✅ Data Collection Complete!\n');
  console.log(`Game Worlds:   ${collection.metadata.totalWorlds}`);
  console.log(`Trajectories:  ${collection.metadata.totalTrajectories}`);
  console.log(`Benchmarks:    ${collection.metadata.totalBenchmarks}`);
  console.log(`Date Range:    ${collection.metadata.dateRange.start} to ${collection.metadata.dateRange.end}`);
  console.log(`Months:        ${Object.keys(worldsByMonth).length + Object.keys(trajectoriesByMonth).length + Object.keys(benchmarksByMonth).length} unique`);
  console.log(`Duration:      ${duration}ms`);
  console.log(`\nOutput:        ${outputDir}`);
  console.log('');
  
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('❌ Collection failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});


