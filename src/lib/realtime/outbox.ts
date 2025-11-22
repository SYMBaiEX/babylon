import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { streamAdd } from '@/lib/redis'
import type { RealtimeChannel, RealtimeEventEnvelope } from './index'
import { toStreamKey } from './index'
import { randomUUID } from 'crypto'

const MAX_ATTEMPTS = 5
const BATCH_SIZE = 100

/**
 * Persist an event in the realtime outbox for retry.
 */
export async function enqueueOutbox(event: RealtimeEventEnvelope): Promise<void> {
  try {
    await prisma.realtimeOutbox.create({
      data: {
        id: randomUUID(),
        channel: event.channel,
        type: event.type,
        version: event.version ?? 'v1',
        payload: event as unknown as Record<string, unknown>,
      },
    })
  } catch (error) {
    logger.error('Failed to enqueue realtime outbox event', { error, channel: event.channel, type: event.type }, 'RealtimeOutbox')
  }
}

/**
 * Drain a batch of pending/failed events and publish to Streams.
 */
export async function drainOutboxBatch(limit: number = BATCH_SIZE): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const rows = await prisma.realtimeOutbox.findMany({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'failed', attempts: { lt: MAX_ATTEMPTS } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let sent = 0
  let failed = 0

  for (const row of rows) {
    const envelope = row.payload as unknown as RealtimeEventEnvelope
    try {
      await streamAdd(toStreamKey(envelope.channel as RealtimeChannel), envelope as Record<string, any>, {
        maxlen: 10_000,
      })
      await prisma.realtimeOutbox.update({
        where: { id: row.id },
        data: { status: 'sent', attempts: { increment: 1 }, lastError: null },
      })
      sent++
    } catch (error) {
      failed++
      const attempts = row.attempts + 1
      await prisma.realtimeOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          lastError: `${error}`,
        },
      })
      logger.warn('Realtime outbox publish failed', { id: row.id, attempts }, 'RealtimeOutbox')
    }
  }

  return { processed: rows.length, sent, failed }
}
