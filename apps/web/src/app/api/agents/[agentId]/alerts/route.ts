/**
 * Agent Price Alerts API
 *
 * @route GET /api/agents/[agentId]/alerts - List price alerts
 * @route POST /api/agents/[agentId]/alerts - Create/update a price alert
 * @route DELETE /api/agents/[agentId]/alerts - Remove a price alert
 * @access Authenticated (manager only)
 *
 * Manages price alerts stored in userAgentConfigs.priceAlerts JSONB column.
 * Alerts are checked every autonomous tick (~3 min) by PriceAlertService.
 */

import { authenticateUser, withErrorHandling } from '@babylon/api';
import { db, eq, userAgentConfigs, users } from '@babylon/db';
import type { PriceAlert } from '@babylon/db/schema';
import { generateSnowflakeId } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Verify agent exists, is an agent, and is managed by the authenticated user.
 * Returns the agent's userAgentConfigs row or an error response.
 */
async function verifyAgentOwnership(
  req: NextRequest,
  agentId: string
): Promise<
  | { error: NextResponse }
  | { config: { id: string; priceAlerts: PriceAlert[] }; userId: string }
> {
  const user = await authenticateUser(req);

  const [agent] = await db
    .select({
      id: users.id,
      isAgent: users.isAgent,
      managedBy: users.managedBy,
    })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent || !agent.isAgent) {
    return {
      error: NextResponse.json({ error: 'Agent not found' }, { status: 404 }),
    };
  }

  if (agent.managedBy !== user.id) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }),
    };
  }

  const [config] = await db
    .select({
      id: userAgentConfigs.id,
      priceAlerts: userAgentConfigs.priceAlerts,
    })
    .from(userAgentConfigs)
    .where(eq(userAgentConfigs.userId, agentId))
    .limit(1);

  if (!config) {
    return {
      error: NextResponse.json(
        { error: 'Agent configuration not found' },
        { status: 404 }
      ),
    };
  }

  return {
    config: {
      id: config.id,
      priceAlerts: (config.priceAlerts ?? []) as PriceAlert[],
    },
    userId: user.id,
  };
}

/**
 * GET - List all price alerts for an agent
 */
export const GET = withErrorHandling(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const result = await verifyAgentOwnership(req, agentId);

  if ('error' in result) return result.error;

  return NextResponse.json({
    success: true,
    alerts: result.config.priceAlerts,
  });
});

/**
 * POST - Create or update a price alert
 *
 * Body: { tokenSymbol, condition, threshold, deliveryChannel?, deliveryChatId?, cooldownMinutes? }
 *
 * If an alert for the same tokenSymbol+condition already exists, it is updated.
 */
export const POST = withErrorHandling(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const result = await verifyAgentOwnership(req, agentId);

  if ('error' in result) return result.error;

  const body = (await req.json()) as Record<string, unknown>;
  const {
    tokenSymbol,
    condition,
    threshold,
    deliveryChannel,
    deliveryChatId,
    cooldownMinutes,
  } = body;

  // Validate required fields
  if (
    typeof tokenSymbol !== 'string' ||
    !tokenSymbol.trim() ||
    (condition !== 'above' && condition !== 'below') ||
    typeof threshold !== 'number' ||
    threshold <= 0
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid input. Required: tokenSymbol (string), condition ("above"|"below"), threshold (positive number)',
      },
      { status: 400 }
    );
  }

  if (deliveryChannel === 'group' && typeof deliveryChatId !== 'string') {
    return NextResponse.json(
      { error: 'deliveryChatId is required when deliveryChannel is "group"' },
      { status: 400 }
    );
  }

  const alerts = result.config.priceAlerts;
  const upperSymbol = tokenSymbol.trim().toUpperCase();

  // Check for existing alert with same token+condition
  const existingIdx = alerts.findIndex(
    (a) => a.tokenSymbol === upperSymbol && a.condition === condition
  );

  const now = new Date().toISOString();
  let alert: PriceAlert;
  let updated = false;

  if (existingIdx >= 0) {
    // Update existing
    const existing = alerts[existingIdx]!;
    alert = {
      ...existing,
      threshold,
      deliveryChannel:
        (deliveryChannel as 'team_chat' | 'group') ?? existing.deliveryChannel,
      deliveryChatId:
        typeof deliveryChatId === 'string'
          ? deliveryChatId
          : existing.deliveryChatId,
      cooldownMinutes:
        typeof cooldownMinutes === 'number'
          ? cooldownMinutes
          : existing.cooldownMinutes,
      enabled: true,
      lastTriggeredAt: undefined, // Reset cooldown on update
    };
    alerts[existingIdx] = alert;
    updated = true;
  } else {
    // Create new
    alert = {
      id: await generateSnowflakeId(),
      tokenSymbol: upperSymbol,
      condition: condition as 'above' | 'below',
      threshold,
      deliveryChannel:
        (deliveryChannel as 'team_chat' | 'group') ?? 'team_chat',
      deliveryChatId:
        typeof deliveryChatId === 'string' ? deliveryChatId : undefined,
      enabled: true,
      cooldownMinutes:
        typeof cooldownMinutes === 'number' ? cooldownMinutes : 15,
      createdAt: now,
    };
    alerts.push(alert);
  }

  await db
    .update(userAgentConfigs)
    .set({ priceAlerts: alerts, updatedAt: new Date() })
    .where(eq(userAgentConfigs.id, result.config.id));

  return NextResponse.json(
    {
      success: true,
      alert,
      updated,
    },
    { status: updated ? 200 : 201 }
  );
});

/**
 * DELETE - Remove a price alert
 *
 * Query params: ?alertId=... OR ?tokenSymbol=...&condition=...
 */
export const DELETE = withErrorHandling(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const result = await verifyAgentOwnership(req, agentId);

  if ('error' in result) return result.error;

  const url = new URL(req.url);
  const alertId = url.searchParams.get('alertId');
  const tokenSymbol = url.searchParams.get('tokenSymbol');
  const condition = url.searchParams.get('condition');

  if (!alertId && !tokenSymbol) {
    return NextResponse.json(
      { error: 'Provide alertId or tokenSymbol query parameter' },
      { status: 400 }
    );
  }

  const alerts = result.config.priceAlerts;
  let removed: PriceAlert | undefined;
  let remaining: PriceAlert[];

  if (alertId) {
    removed = alerts.find((a) => a.id === alertId);
    remaining = alerts.filter((a) => a.id !== alertId);
  } else {
    const upperSymbol = tokenSymbol!.toUpperCase();
    removed = alerts.find(
      (a) =>
        a.tokenSymbol === upperSymbol &&
        (!condition || a.condition === condition)
    );
    remaining = removed ? alerts.filter((a) => a.id !== removed!.id) : alerts;
  }

  if (!removed) {
    return NextResponse.json(
      { error: 'Price alert not found' },
      { status: 404 }
    );
  }

  await db
    .update(userAgentConfigs)
    .set({ priceAlerts: remaining, updatedAt: new Date() })
    .where(eq(userAgentConfigs.id, result.config.id));

  return NextResponse.json({
    success: true,
    removed,
  });
});
