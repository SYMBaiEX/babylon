/**
 * A2A Game Integration (HTTP-based)
 *
 * NOTE: A2A now uses Next.js API routes instead of a separate WebSocket server.
 * See /src/app/api/a2a/route.ts and /src/app/.well-known/agent-card/route.ts
 * 
 * This file is kept for backward compatibility with GameEngine but no longer
 * starts a separate server. All A2A functionality is handled via HTTP.
 */
import { EventEmitter } from 'events';
import { logger } from '@/lib/logger';

export interface A2AGameConfig {
  enabled: boolean;
  port?: number;
  host?: string;
  maxConnections?: number;
  enableBlockchain?: boolean;
  rpcUrl?: string;
  identityRegistryAddress?: string;
  reputationSystemAddress?: string;
}

/**
 * A2A Game Integration (Stub)
 * 
 * The actual A2A server is now part of Next.js API routes.
 * This class exists only for backward compatibility.
 */
export class A2AGameIntegration extends EventEmitter {
  private config: A2AGameConfig;

  constructor(config?: A2AGameConfig) {
    super();
    this.config = {
      enabled: false,
      port: 8765,
      host: '0.0.0.0',
      maxConnections: 1000,
      ...config,
    };
  }

  /**
   * Initialize the A2A integration (no-op)
   * A2A is now handled by Next.js API routes
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('A2A integration disabled', undefined, 'A2AGameIntegration');
      return;
    }

    logger.info('A2A Protocol - Using Next.js API Routes', undefined, 'A2AGameIntegration');
    logger.info('Endpoints:', undefined, 'A2AGameIntegration');
    logger.info('  GET  /.well-known/agent-card.json', undefined, 'A2AGameIntegration');
    logger.info('  POST /api/a2a', undefined, 'A2AGameIntegration');
    logger.info('==============================', undefined, 'A2AGameIntegration');
  }

  /**
   * Stop the A2A integration (no-op)
   */
  async stop(): Promise<void> {
    if (this.config.enabled) {
      logger.info('A2A integration stopped (no separate server to stop)', undefined, 'A2AGameIntegration');
    }
  }

  /**
   * Check if A2A is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get configuration
   */
  getConfig(): A2AGameConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance management (kept for compatibility)
 */
const integrationInstances = new Map<number, A2AGameIntegration>();

export function getA2AIntegrationSingleton(port: number): A2AGameIntegration | null {
  return integrationInstances.get(port) || null;
}

export function setA2AIntegrationSingleton(port: number, instance: A2AGameIntegration): void {
  integrationInstances.set(port, instance);
}

export function clearA2AIntegrationSingleton(port: number): void {
  integrationInstances.delete(port);
}
