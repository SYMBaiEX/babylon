/**
 * Collect REAL Benchmark Data for HuggingFace
 * 
 * Collects actual benchmark files from the benchmarks/ directory
 * and prepares them for upload to HuggingFace.
 * 
 * This uses REAL benchmark data, not mock data.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface BenchmarkMetadata {
  id: string;
  version: string;
  createdAt: number;
  duration: number;
  tickInterval: number;
  fileSize: number;
  ticks: number;
  markets: {
    prediction: number;
    perpetual: number;
  };
}

async function collectRealBenchmarks(): Promise<BenchmarkMetadata[]> {
  console.log('Scanning benchmarks/ directory for real benchmark files...\n');
  
  const benchmarksDir = path.join(process.cwd(), 'benchmarks');
  const benchmarks: BenchmarkMetadata[] = [];
  
  const files = await fs.readdir(benchmarksDir);
  
  for (const file of files) {
    if (file.endsWith('.json') && file.startsWith('benchmark-')) {
      const filePath = path.join(benchmarksDir, file);
      const stats = await fs.stat(filePath);
      
      // Only include substantial benchmarks (not tiny test files)
      if (stats.size > 10000) {  // > 10KB
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          
          if (data.ticks && data.initialState) {
            benchmarks.push({
              id: data.id,
              version: data.version,
              createdAt: data.createdAt,
              duration: data.duration,
              tickInterval: data.tickInterval,
              fileSize: stats.size,
              ticks: data.ticks.length,
              markets: {
                prediction: data.initialState.predictionMarkets?.length || 0,
                perpetual: data.initialState.perpetualMarkets?.length || 0,
              },
            });
            
            console.log(`✅ ${file}`);
            console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Ticks: ${data.ticks.length}`);
            console.log(`   Markets: ${data.initialState.predictionMarkets?.length || 0} prediction, ${data.initialState.perpetualMarkets?.length || 0} perpetual`);
            console.log('');
          }
        } catch (error) {
          console.log(`⚠️  Skipping ${file}: ${error instanceof Error ? error.message : 'Invalid format'}`);
        }
      }
    }
  }
  
  return benchmarks;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║    COLLECTING REAL BENCHMARK DATA                      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const benchmarks = await collectRealBenchmarks();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Found ${benchmarks.length} REAL benchmark files\n`);
  
  if (benchmarks.length === 0) {
    console.log('❌ No real benchmark data found!');
    console.log('\nGenerate real benchmarks first:');
    console.log('  npx tsx scripts/generate-benchmark.ts --duration=30 --markets=5');
    process.exit(1);
  }
  
  // Calculate totals
  const totalSize = benchmarks.reduce((sum, b) => sum + b.fileSize, 0);
  const totalTicks = benchmarks.reduce((sum, b) => sum + b.ticks, 0);
  
  console.log('Total Size:', (totalSize / 1024 / 1024).toFixed(2), 'MB');
  console.log('Total Ticks:', totalTicks.toLocaleString());
  console.log('Avg Ticks per Benchmark:', Math.round(totalTicks / benchmarks.length).toLocaleString());
  console.log('');
  
  // Save metadata
  const outputDir = path.join(process.cwd(), 'exports', 'huggingface', 'benchmarks');
  await fs.mkdir(outputDir, { recursive: true });
  
  await fs.writeFile(
    path.join(outputDir, 'benchmark-metadata.json'),
    JSON.stringify({
      collectedAt: new Date().toISOString(),
      totalBenchmarks: benchmarks.length,
      totalSize,
      totalTicks,
      benchmarks,
    }, null, 2)
  );
  
  console.log(`✅ Metadata saved to: ${outputDir}/benchmark-metadata.json`);
  console.log('');
  console.log('This is REAL benchmark data ready for upload!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

