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
import { and, eq, isNull, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Rate limit: maximum 1 heartbeat per minute per session
const HEARTBEAT_RATE_LIMIT_MS = 60 * 1000;

// In-memory rate limit cache (per-session)
const heartbeatCache = new Map<string, number>();

// Clean up old cache entries periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [key, timestamp] of heartbeatCache.entries()) {
      if (now - timestamp > HEARTBEAT_RATE_LIMIT_MS * 2) {
        heartbeatCache.delete(key);
      }
    }
  },
  5 * 60 * 1000
); // Clean every 5 minutes

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
  let userId: string | null = null;

  const tokenParts = privyToken.value.split('.');
  if (tokenParts.length === 3) {
    const payload = tokenParts[1];
    if (payload) {
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as { sub?: string };
      userId = parsed.sub ?? null;
    }
  }

  if (!userId) {
    return NextResponse.json({ success: true, reason: 'no_user_id' });
  }

  // Parse request body
  const body = (await request.json()) as HeartbeatRequest;
  const { sessionId, pageViews = 0 } = body;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
    return NextResponse.json(
      { success: false, error: 'Invalid sessionId' },
      { status: 400 }
    );
  }

  // Rate limit check
  const cacheKey = `${userId}:${sessionId}`;
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

  // Helper to create a new session record
  async function createSession(): Promise<void> {
    const id = await generateSnowflakeId();
    await db.insert(userSessions).values({
      id,
      userId,
      sessionId,
      startedAt: nowDate,
      lastActiveAt: nowDate,
      deviceType,
      userAgent: userAgentHeader?.substring(0, 500),
      ipHash,
      pageCount: pageViews,
      heartbeatCount: 1,
    });
    logger.debug('Created session', { userId, id }, 'POST /api/activity/heartbeat');
  }

  // Check for existing active session
  const existingSession = await db.query.userSessions.findFirst({
    where: and(eq(userSessions.sessionId, sessionId), isNull(userSessions.endedAt)),
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
      // Update existing session
      await db
        .update(userSessions)
        .set({
          lastActiveAt: nowDate,
          pageCount: existingSession.pageCount + pageViews,
          heartbeatCount: existingSession.heartbeatCount + 1,
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
      userId,
      activityType: 'session',
      activityDate,
    })
    .onConflictDoNothing();

  return NextResponse.json({
    success: true,
    sessionId,
  });
});

/**
 * Cleanup job to close stale sessions
 * This should be called by a cron job periodically
 *
 * Returns the sessions that were closed (for logging purposes)
 */
export async function closeStaleSessionsInternal(): Promise<{ id: string }[]> {
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

  // Close them in batches
  for (const session of staleSessions) {
    await db
      .update(userSessions)
      .set({
        endedAt: session.lastActiveAt,
      })
      .where(eq(userSessions.id, session.id));
  }

  return staleSessions.map((s) => ({ id: s.id }));
}
