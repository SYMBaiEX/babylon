import { logger, type FeedEventPayload } from '@babylon/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';

const FLUSH_DELAY_MS = 750;
const MAX_BATCH_SIZE = 20;

export function useFeedEventTracker() {
  const { authenticated, getAccessToken } = useAuth();
  const queueRef = useRef<FeedEventPayload[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (!authenticated || isFlushingRef.current || queueRef.current.length === 0) {
      return;
    }

    isFlushingRef.current = true;
    const batch = queueRef.current.splice(0, MAX_BATCH_SIZE);

    try {
      const token = await getAccessToken();
      if (!token) {
        queueRef.current.unshift(...batch);
        return;
      }

      const response = await fetch('/api/feed/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });

      if (!response.ok) {
        queueRef.current.unshift(...batch);
      }
    } catch (error) {
      queueRef.current.unshift(...batch);
      logger.warn(
        'Failed to flush feed events',
        { error, batchSize: batch.length },
        'useFeedEventTracker'
      );
    } finally {
      isFlushingRef.current = false;
      if (queueRef.current.length > 0) {
        flushTimerRef.current = setTimeout(() => {
          void flush();
        }, FLUSH_DELAY_MS);
      } else {
        flushTimerRef.current = null;
      }
    }
  }, [authenticated, getAccessToken]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flush();
    }, FLUSH_DELAY_MS);
  }, [flush]);

  const trackEvent = useCallback(
    (event: FeedEventPayload) => {
      if (!authenticated) return;
      queueRef.current.push(event);
      if (queueRef.current.length >= MAX_BATCH_SIZE) {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        void flush();
        return;
      }
      scheduleFlush();
    },
    [authenticated, flush, scheduleFlush]
  );

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (queueRef.current.length > 0) {
        void flush();
      }
    };
  }, [flush]);

  return { trackEvent, flush };
}
