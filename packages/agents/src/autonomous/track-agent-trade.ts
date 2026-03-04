/**
 * Server-side PostHog tracking for agent trades.
 * Used by AutonomousTradingService, AutonomousA2AService, and MultiStepExecutor
 * when running in the Next.js app (e.g. cron); no-ops when NEXT_PUBLIC_POSTHOG_PROJECT_ID is not set.
 * Environment properties match apps/web/src/lib/posthog/server.ts for consistent filtering.
 */

import { PostHog } from 'posthog-node';

let client: PostHog | null = null;

function getServerEnvironment(): 'production' | 'staging' | 'development' {
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'staging';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

function getEnvironmentProperties(): Record<string, string> {
  return {
    environment: getServerEnvironment(),
    deployment_url: process.env.VERCEL_URL || 'localhost:3000',
    app_version: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  };
}

function getClient(): PostHog | null {
  if (client !== null) return client;
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID;
  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
  if (!apiKey) return null;
  try {
    client = new PostHog(apiKey, {
      host: apiHost,
      flushAt: 10,
      flushInterval: 5000,
    });
  } catch {
    return null;
  }
  return client;
}

export interface AgentTradeExecutedProperties {
  agent_id: string;
  market_type: 'prediction' | 'perp';
  action: string;
  market_id?: string;
  ticker?: string;
  side?: string;
  amount?: number;
  owner_id: string;
}

/**
 * Track agent_trade_executed in PostHog.
 * distinctId is the agent user id; owner_id in properties for owner analytics.
 */
export function trackAgentTradeExecuted(
  agentUserId: string,
  properties: AgentTradeExecutedProperties
): void {
  const c = getClient();
  if (!c) return;
  try {
    c.capture({
      distinctId: agentUserId,
      event: 'agent_trade_executed',
      properties: {
        ...properties,
        $lib: 'posthog-node',
        ...getEnvironmentProperties(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // no-op on error to avoid breaking trade flow
  }
}
