/**
 * Discord Activity OAuth Token Exchange API
 *
 * @route POST /api/auth/discord/activity - Exchange Discord Activity auth code for access token
 * @access Public (called from the Discord Activity iframe)
 *
 * @description
 * Handles the OAuth2 code exchange for Discord Activities (Embedded Apps).
 * The Discord Embedded App SDK calls `commands.authorize()` which returns a code.
 * This endpoint exchanges that code for an access_token, which is then passed back
 * to the client for `commands.authenticate()`.
 */

import { withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().uuid('Invalid OAuth state parameter'),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const clientId =
    process.env.NEXT_PUBLIC_DISCORD_ACTIVITY_CLIENT_ID ||
    process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error(
      'Discord Activity token exchange failed: missing credentials',
      {},
      'DiscordActivity'
    );
    return NextResponse.json(
      { error: 'Discord Activity not configured' },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Missing or invalid request parameters' },
      { status: 400 }
    );
  }

  const { code, state } = parsed.data;

  // Log the state for audit trail (value itself is non-sensitive — it's a
  // one-time nonce generated client-side for CSRF protection).
  logger.debug(
    'Discord Activity token exchange request received',
    { statePresent: !!state },
    'DiscordActivity'
  );

  try {
    const tokenResponse = await fetch(
      'https://discord.com/api/v10/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(
        'Discord Activity token exchange failed',
        { status: tokenResponse.status, error: errorText },
        'DiscordActivity'
      );
      return NextResponse.json(
        { error: 'Token exchange failed' },
        { status: tokenResponse.status }
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
    };

    logger.info(
      'Discord Activity token exchange successful',
      { scope: tokenData.scope },
      'DiscordActivity'
    );

    return NextResponse.json({ access_token: tokenData.access_token });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      'Discord Activity token exchange error',
      { error: message },
      'DiscordActivity'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
