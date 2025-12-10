/**
 * Next.js Instrumentation
 *
 * Runs on server startup to register Babylon in Agent0 registry and initialize Sentry.
 * This file handles server-side Sentry initialization.
 *
 * Note: Client-side Sentry is initialized via instrumentation-client.ts
 */

import * as Sentry from '@sentry/nextjs';

const sentryDisabled =
  process.env.DISABLE_SENTRY === 'true' ||
  process.env.NEXT_PUBLIC_DISABLE_SENTRY === 'true';

export async function register() {
  // Skip instrumentation during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  // Only initialize services in Node.js runtime (not Edge Runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamically import Node.js-only modules to avoid Edge Runtime errors
    // Import from main package entry point
    const {
      setPointsService,
      setNotificationService,
      PointsService,
      createNotification,
      logDevCredentials,
    } = await import('@babylon/api');

    // Log development credentials at startup (only in dev mode)
    // This makes it easy for developers to authenticate with admin APIs
    logDevCredentials();

    // Initialize agent service container with required services
    // Uses globalThis to persist across module instances
    const { setServiceContainer, agentRegistry, npcBootstrapService } =
      await import('@babylon/agents');
    setServiceContainer({
      agentRegistry,
    });

    // Bootstrap NPC agents so they're registered for agent-tick processing
    // Runs asynchronously to avoid blocking server startup
    npcBootstrapService.bootstrapAllNpcs().then((result) => {
      console.info(
        `[NPCBootstrap] Initialized ${result.initialized}/${result.totalNpcs} NPCs`
      );
    });

    // Initialize shared moderation services with web app implementations
    setPointsService({
      awardPoints: async (userId, amount, reason, metadata) => {
        // Cast metadata from Record<string, unknown> to Record<string, JsonValue>
        // JsonValue is a subset of unknown, so this cast is safe
        // JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
        return await PointsService.awardPoints(
          userId,
          amount,
          reason as never,
          metadata as Parameters<typeof PointsService.awardPoints>[3]
        );
      },
    });

    setNotificationService({
      createNotification: async (params) => {
        // Cast params to match CreateNotificationParams type
        // setNotificationService interface uses string for type, but createNotification expects NotificationType
        return await createNotification(
          params as Parameters<typeof createNotification>[0]
        );
      },
    });
  }

  if (sentryDisabled && process.env.NODE_ENV === 'development') {
    console.info('[Sentry] Disabled via DISABLE_SENTRY flag');
  }

  // Initialize Sentry for server-side (Node.js runtime)
  if (!sentryDisabled && process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  // Register reputation sync service if agents package is available
  // This breaks the circular dependency between engine and agents packages
  // Only load agent0 code server-side to avoid bundling electron-fetch in client
  if (
    process.env.AGENT0_ENABLED === 'true' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    const { setReputationSyncService } = await import('@babylon/engine');
    const { createReputationSyncAdapter } = await import('@babylon/agents');
    setReputationSyncService(createReputationSyncAdapter());
  }

  // Register Babylon on Agent0 registry (ERC-8004) on startup
  // Only if Agent0 is enabled and we're in Node.js runtime
  // Only load agent0 code server-side to avoid bundling electron-fetch in client
  if (
    process.env.AGENT0_ENABLED === 'true' &&
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NODE_ENV === 'production' // Only in production to avoid blocking dev
  ) {
    const { registerBabylonGame } = await import('@babylon/agents');
    await registerBabylonGame();
  }
}

// Export request error handler for Next.js App Router
export const onRequestError = Sentry.captureRequestError;
