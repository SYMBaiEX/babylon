/**
 * Perpetuals Service - Singleton wrapper for PerpetualsEngine
 * 
 * Provides server-side access to perpetuals trading functionality
 */

import { PerpetualsEngine } from '@/engine/PerpetualsEngine';
import { db } from './database-service';

let perpsEngineInstance: PerpetualsEngine | null = null;

export function getPerpsEngine(): PerpetualsEngine {
  // Only instantiate on server side
  if (typeof window !== 'undefined') {
    throw new Error('PerpetualsEngine can only be instantiated on the server side');
  }
  
  if (!perpsEngineInstance) {
    perpsEngineInstance = new PerpetualsEngine();
    
    // Initialize with organizations from database
    initializePerpsEngine().catch(error => {
      console.error('Failed to initialize PerpetualsEngine:', error);
    });
  }
  
  return perpsEngineInstance;
}

async function initializePerpsEngine() {
  if (!perpsEngineInstance) return;
  
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const organizations = await db.getAllOrganizations();
      
      if (!organizations || organizations.length === 0) {
        throw new Error('No organizations found in database');
      }
      
      perpsEngineInstance.initializeMarkets(organizations);
      console.log('✅ PerpetualsEngine initialized successfully');
      return;
    } catch (error) {
      retries++;
      console.error(`Failed to initialize PerpsEngine (attempt ${retries}/${maxRetries}):`, error);
      
      if (retries >= maxRetries) {
        console.error('❌ CRITICAL: PerpetualsEngine failed to initialize after max retries');
        throw new Error('PerpetualsEngine initialization failed');
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
}

// Export singleton
export const perpsEngine = typeof window === 'undefined' ? getPerpsEngine() : null as unknown as PerpetualsEngine;

