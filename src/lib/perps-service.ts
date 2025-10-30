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
  
  try {
    const organizations = await db.getAllOrganizations();
    perpsEngineInstance.initializeMarkets(organizations as any);
  } catch (error) {
    console.error('Failed to load organizations for perps engine:', error);
  }
}

// Export singleton
export const perpsEngine = typeof window === 'undefined' ? getPerpsEngine() : null as unknown as PerpetualsEngine;

