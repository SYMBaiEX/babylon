#!/usr/bin/env bun
/**
 * Force First Tick - Immediately generate initial content
 * 
 * This triggers the cron endpoint to generate the first batch of posts.
 * Useful for bootstrapping a fresh database.
 */

import { logger } from '../src/lib/logger';

async function main() {
  logger.info('🚀 Forcing first content generation...', undefined, 'Bootstrap');
  
  try {
    const response = await fetch('http://localhost:3000/api/cron/game-tick', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer development',
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      logger.error(`Failed (HTTP ${response.status}):`, error, 'Bootstrap');
      process.exit(1);
    }
    
    const result = await response.json();
    
    if (result.success) {
      logger.info('✅ Content generated successfully!', undefined, 'Bootstrap');
      logger.info('', undefined, 'Bootstrap');
      logger.info('📊 Results:', result.result, 'Bootstrap');
      logger.info('', undefined, 'Bootstrap');
      logger.info('🎉 Refresh your browser at http://localhost:3000/feed', undefined, 'Bootstrap');
      logger.info('   Posts should now appear!', undefined, 'Bootstrap');
    } else {
      logger.error('❌ Generation failed:', result, 'Bootstrap');
      process.exit(1);
    }
    
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      logger.error('❌ Cannot connect to http://localhost:3000', undefined, 'Bootstrap');
      logger.error('', undefined, 'Bootstrap');
      logger.error('Start the web server first:', undefined, 'Bootstrap');
      logger.error('  bun run dev', undefined, 'Bootstrap');
      logger.error('', undefined, 'Bootstrap');
      logger.error('Then run this script again.', undefined, 'Bootstrap');
    } else {
      logger.error('❌ Error:', error, 'Bootstrap');
    }
    process.exit(1);
  }
}

main();

