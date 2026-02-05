/**
 * POST /api/activity/heartbeat - Session heartbeat endpoint
 *
 * Records client session activity for engagement metrics.
 * Called every 5 minutes by the client-side heartbeat hook.
 *
 * Creates a new session if:
 * - No session exists for this sessionId
 * - Last activity was more than 30 minutes ago
 *
 * Updates existing session's lastActiveAt and counters.
 *
 * @module /api/activity/heartbeat
 */

import { withErrorHandling } from '@babylon/api';
import {
  db,
  generateSnowflakeId,
  userActivityLogs,
  userSessions,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Rate limit: maximum 1 heartbeat per minute per session
const HEARTBEAT_RATE_LIMIT_MS = 60 * 1000;

// Maximum allowed page views per heartbeat (prevents abuse)
const MAX_PAGE_VIEWS_PER_HEARTBEAT = 100;

// In-memory rate limit cache (per-session)
// NOTE: This works for single-server deployments. For horizontal scaling with
// multiple server instances, consider using Redis-based rate limiting to ensure
// rate limits are enforced consistently across all instances.
const heartbeatCache = new Map<string, number>();

/**
 * Clean up stale entries from the rate limit cache.
 * Called on each request to avoid module-scope setInterval (serverless-unfriendly).
 */
function cleanupRateLimitCache(): void {
  const cutoff = Date.now() - HEARTBEAT_RATE_LIMIT_MS * 2;
  for (const [key, timestamp] of heartbeatCache.entries()) {
    if (timestamp < cutoff) {
      heartbeatCache.delete(key);
    }
  }
}

/**
 * Decode a base64url-encoded string (as used in JWTs).
 * Handles the URL-safe alphabet and missing padding.
 */
function decodeBase64Url(input: string): string {
  // Convert base64url to standard base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const paddingNeeded = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(paddingNeeded);
  return Buffer.from(base64, 'base64').toString('utf-8');
}

interface HeartbeatRequest {
  sessionId: string;
  pageViews?: number;
  lastPath?: string;
}

function parseDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(ua)) {
    if (/ipad|tablet/.test(ua)) return 'tablet';
    return 'mobile';
  }
  return 'desktop';
}

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.IP_HASH_SALT || 'babylon'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Get user from Privy session
  // We use cookies directly to avoid full auth overhead for this lightweight endpoint
  const cookieStore = await cookies();
  const privyToken = cookieStore.get('privy-token');

  if (!privyToken?.value) {
    // Silently accept unauthenticated requests to avoid console errors
    // for logged-out users who still have the heartbeat running
    return NextResponse.json({ success: true, reason: 'unauthenticated' });
  }

  // Decode the JWT to get the user ID (we don't verify signature here for speed)
  // The privy-token is a JWT with the user ID in the sub claim
  // Note: This is intentionally unverified for performance - the endpoint is non-critical
  // and a compromised session ID only affects analytics quality, not user data
  let userId: string | null = null;

  const tokenParts = privyToken.value.split('.');
  if (tokenParts.length === 3) {
    const payload = tokenParts[1];
    if (payload) {
      // Use base64url decoding (JWTs use URL-safe base64 alphabet)
      try {
        const decoded = decodeBase64Url(payload);
        const parsed = JSON.parse(decoded) as { sub?: string };
        userId = parsed.sub ?? null;
      } catch {
        userId = null;
      }
    }
  }

  if (!userId) {
    return NextResponse.json({ success: true, reason: 'no_user_id' });
  }

  // After validation, userId is guaranteed to be string
  const validUserId: string = userId;

  // Parse request body
  const body = (await request.json()) as HeartbeatRequest;
  const { sessionId } = body;

  // Validate and normalize pageViews (prevent abuse with large/negative values)
  const rawPageViews = body.pageViews ?? 0;
  const pageViews = Math.min(
    Math.max(0, Math.floor(Number(rawPageViews) || 0)),
    MAX_PAGE_VIEWS_PER_HEARTBEAT
  );

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
    return NextResponse.json(
      { success: false, error: 'Invalid sessionId' },
      { status: 400 }
    );
  }

  // Clean up stale rate limit cache entries (replaces module-scope setInterval)
  cleanupRateLimitCache();

  // Rate limit check
  const cacheKey = `${validUserId}:${sessionId}`;
  const lastHeartbeat = heartbeatCache.get(cacheKey);
  const now = Date.now();

  if (lastHeartbeat && now - lastHeartbeat < HEARTBEAT_RATE_LIMIT_MS) {
    return NextResponse.json({ success: true, reason: 'rate_limited' });
  }

  heartbeatCache.set(cacheKey, now);

  // Get device info
  const userAgentHeader = request.headers.get('user-agent');
  const deviceType = parseDeviceType(userAgentHeader);
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor?.split(',')[0]?.trim() ?? null;
  const ipHash = await hashIp(clientIp);

  const nowDate = new Date();
  const sessionTimeoutThreshold = new Date(
    nowDate.getTime() - SESSION_TIMEOUT_MS
  );

  // DB work (best-effort): if the session tables are missing/mis-migrated in a
  // given environment, we don't want to hard-fail the user flow.
  try {
    // Helper to create a new session record
    async function createSession(): Promise<void> {
      const id = await generateSnowflakeId();
      await db.insert(userSessions).values({
        id,
        userId: validUserId,
        sessionId,
        startedAt: nowDate,
        lastActiveAt: nowDate,
        deviceType: deviceType || undefined,
        userAgent: userAgentHeader
          ? userAgentHeader.substring(0, 500)
          : undefined,
        ipHash: ipHash || undefined,
        pageCount: pageViews,
        heartbeatCount: 1,
      });
      logger.debug(
        'Created session',
        { userId: validUserId, id },
        'POST /api/activity/heartbeat'
      );
    }

    // Check for existing active session
    const existingSession = await db.query.userSessions.findFirst({
      where: and(
        eq(userSessions.userId, validUserId),
        eq(userSessions.sessionId, sessionId),
        isNull(userSessions.endedAt)
      ),
    });

    if (existingSession) {
      const isTimedOut = existingSession.lastActiveAt < sessionTimeoutThreshold;
      if (isTimedOut) {
        // Close old session and create new one
        await db
          .update(userSessions)
          .set({ endedAt: existingSession.lastActiveAt })
          .where(eq(userSessions.id, existingSession.id));
        await createSession();
      } else {
        // Update existing session with atomic increments to prevent race conditions
        await db
          .update(userSessions)
          .set({
            lastActiveAt: nowDate,
            pageCount: sql`${userSessions.pageCount} + ${pageViews}`,
            heartbeatCount: sql`${userSessions.heartbeatCount} + 1`,
          })
          .where(eq(userSessions.id, existingSession.id));
      }
    } else {
      await createSession();
    }

    // Log activity for retention tracking (one row per user per day)
    const activityDate = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate()
    );

    const activityLogId = await generateSnowflakeId();
    await db
      .insert(userActivityLogs)
      .values({
        id: activityLogId,
        userId: validUserId,
        activityType: 'session',
        activityDate,
      })
      .onConflictDoNothing();
  } catch (error) {
    const causeCode = (error as { cause?: { code?: string } } | null)?.cause
      ?.code;
    const code = causeCode ?? (error as { code?: string } | null)?.code;

    // 42P01 = undefined_table, 42703 = undefined_column
    if (code === '42P01' || code === '42703') {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(
        'Heartbeat DB unavailable (degraded)',
        { code, errorMessage },
        'POST /api/activity/heartbeat'
      );
      return NextResponse.json({ success: true, reason: 'db_unavailable' });
    }

    throw error;
  }

  // Opportunistically close stale sessions (non-blocking, ~25% of requests)
  // Higher probability ensures timely cleanup during low-traffic periods
  if (Math.random() < 0.25) {
    closeStaleSessionsInternal().catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(
        'Opportunistic stale-session cleanup failed',
        { errorMessage },
        'POST /api/activity/heartbeat'
      );
    });
  }

  return NextResponse.json({
    success: true,
    sessionId,
  });
});

/**
 * Cleanup job to close stale sessions.
 * Called opportunistically during heartbeat requests.
 *
 * Returns the sessions that were closed (for logging purposes)
 */
async function closeStaleSessionsInternal(): Promise<{ id: string }[]> {
  const threshold = new Date(Date.now() - SESSION_TIMEOUT_MS);

  // Find stale sessions first
  const staleSessions = await db.query.userSessions.findMany({
    where: and(
      isNull(userSessions.endedAt),
      lt(userSessions.lastActiveAt, threshold)
    ),
    columns: {
      id: true,
      lastActiveAt: true,
    },
  });

  if (staleSessions.length === 0) {
    return [];
  }

  const staleSessionIds = staleSessions.map((s) => s.id);

  await db
    .update(userSessions)
    .set({
      endedAt: sql`${userSessions.lastActiveAt}`,
    })
    .where(
      and(
        isNull(userSessions.endedAt),
        lt(userSessions.lastActiveAt, threshold),
        inArray(userSessions.id, staleSessionIds)
      )
    );

  return staleSessions.map((s) => ({ id: s.id }));
}
