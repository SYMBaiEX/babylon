import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

interface RelayResult {
  forwarded: boolean;
  status?: number;
  error?: string;
}

/**
 * Conditionally relay cron execution to staging environment.
 * Enabled when REDIRECT_CRON_STAGING=true and host is not already staging.
 */
export async function relayCronToStaging(
  request: NextRequest,
  routeName: string
): Promise<RelayResult> {
  if (process.env.REDIRECT_CRON_STAGING !== 'true') {
    return { forwarded: false };
  }

  const stagingBaseUrl =
    process.env.CRON_STAGING_URL || 'https://staging.babylon.market';
  const stagingHost = stagingBaseUrl.replace(/^https?:\/\//, '');
  const requestHost = request.headers.get('host') || '';

  // Avoid infinite loops when request already targets staging
  if (requestHost === stagingHost) {
    return { forwarded: false };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.warn(
      'Cannot relay cron - CRON_SECRET missing',
      { routeName },
      'CronRelay'
    );
    return { forwarded: false };
  }

  const { pathname, search } = new URL(request.url);
  const targetUrl = `${stagingBaseUrl}${pathname}${search}`;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'x-cron-relay': routeName,
      },
      cache: 'no-store',
    });

    logger.info(
      'Relayed cron execution to staging',
      {
        routeName,
        targetUrl,
        status: res.status,
      },
      'CronRelay'
    );

    return { forwarded: true, status: res.status };
  } catch (error) {
    logger.error(
      'Failed to relay cron to staging',
      {
        routeName,
        targetUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      'CronRelay'
    );

    return {
      forwarded: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
