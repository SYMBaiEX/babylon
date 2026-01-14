/**
 * External Agent Revocation Endpoint
 *
 * DELETE /api/agents/external/[externalId]/revoke
 *
 * Revokes an external agent's API key. Only the user who registered the agent
 * or an admin can revoke the key. Once revoked, the key cannot be used for
 * authentication.
 */

import { agentRegistry } from '@babylon/agents';
import { authenticate, isUserAdmin } from '@babylon/api';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ externalId: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate the request
    const authUser = await authenticate(req);

    const { externalId } = await params;

    if (!externalId) {
      return NextResponse.json(
        { error: 'Missing externalId parameter' },
        { status: 400 }
      );
    }

    // Get the external agent connection to check ownership
    const connection =
      await agentRegistry.getExternalAgentConnection(externalId);

    if (!connection) {
      return NextResponse.json(
        { error: 'External agent not found' },
        { status: 404 }
      );
    }

    // Check authorization: only owner or admin can revoke
    // Note: revokedAt check is handled by the service layer to avoid race conditions
    const isOwner = connection.registeredByUserId === authUser.userId;
    const isAdmin = await isUserAdmin(authUser.userId);

    if (!isOwner && !isAdmin) {
      logger.warn(
        `Unauthorized revocation attempt for agent ${externalId}`,
        {
          userId: authUser.userId,
          externalId,
          registeredByUserId: connection.registeredByUserId,
        },
        'ExternalAgentRevoke'
      );
      return NextResponse.json(
        { error: 'Only the owner or an admin can revoke this agent' },
        { status: 403 }
      );
    }

    // Revoke the agent
    await agentRegistry.revokeExternalAgent(externalId, authUser.userId);

    logger.info(
      `External agent ${externalId} revoked`,
      {
        externalId,
        revokedBy: authUser.userId,
        isAdmin,
        isOwner,
      },
      'ExternalAgentRevoke'
    );

    return NextResponse.json(
      {
        success: true,
        message: 'External agent API key revoked successfully',
        externalId,
        revokedBy: authUser.userId,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      'Failed to revoke external agent',
      { error: error instanceof Error ? error.message : String(error) },
      'ExternalAgentRevoke'
    );

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to revoke external agent' },
      { status: 500 }
    );
  }
}
