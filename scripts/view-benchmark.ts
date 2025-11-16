/**
 * View Benchmark Data Script
 * 
 * Displays benchmark data in a readable format.
 * 
 * Usage:
 *   bun run scripts/view-benchmark.ts <benchmark-file> [--verbose] [--show-hidden]
 */

import { BenchmarkDataViewer } from '@/lib/benchmark/BenchmarkDataViewer';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: bun run scripts/view-benchmark.ts <benchmark-file> [--verbose] [--show-hidden]');
    process.exit(1);
  }
  
  const verbose = args.includes('--verbose');
  const showHidden = args.includes('--show-hidden');
  
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  try {
    const view = await BenchmarkDataViewer.view(fullPath, {
      verbose,
      showGroundTruth: true,
      showHidden,
    });
    
    BenchmarkDataViewer.print(view, {
      verbose,
      showHidden,
    });
    
    // Verify security
    const securityCheck = BenchmarkDataViewer.verifyAgentCannotAccessHiddenFacts(
      JSON.parse(await import('fs').then(m => m.promises.readFile(fullPath, 'utf-8')))
    );
    
    console.log('\n🔒 Security Check:');
    console.log(`  Agents can access hidden facts: ${securityCheck.canAccess ? '❌ YES (SECURITY ISSUE!)' : '✅ NO'}`);
    console.log(`  Reason: ${securityCheck.reason}`);
    
  } catch (error) {
    console.error('Error viewing benchmark:', error);
    process.exit(1);
  }
}

main();



