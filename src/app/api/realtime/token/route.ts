import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { authenticate } from '@/lib/api/auth-middleware'
import { logger } from '@/lib/logger'
import { issueRealtimeToken, type RealtimeChannel } from '@/lib/realtime'
import { prisma } from '@/lib/prisma'

const BodySchema = z.object({
  channels: z.array(z.string()).optional(),
  chatIds: z.array(z.string()).optional(),
  includeNotifications: z.coerce.boolean().optional(),
  ttlSeconds: z.number().int().positive().max(3600).optional(),
})

const PUBLIC_CHANNELS: RealtimeChannel[] = [
  'feed',
  'markets',
  'breaking-news',
  'upcoming-events',
]

const dedupe = <T>(items: T[]) => Array.from(new Set(items))

export async function POST(request: NextRequest) {
  const user = await authenticate(request)

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // ignore empty body
  }

  const { channels = [], chatIds = [], includeNotifications = true, ttlSeconds } =
    BodySchema.parse(body)

  const requestedChannels = channels.filter(Boolean) as RealtimeChannel[]
  const baseChannels = [...PUBLIC_CHANNELS]

  if (includeNotifications) {
    baseChannels.push(`notifications:${user.userId}`)
  }

  const derivedChatIds = dedupe([
    ...chatIds,
    ...requestedChannels
      .filter((ch) => ch.startsWith('chat:'))
      .map((ch) => ch.replace('chat:', '')),
  ]).filter(Boolean)

  const allowedChats =
    derivedChatIds.length > 0
      ? await prisma.chatParticipant.findMany({
          where: { userId: user.userId, chatId: { in: derivedChatIds } },
          select: { chatId: true },
        })
      : []

  const allowedChatIds = new Set(allowedChats.map((c) => c.chatId))
  const chatChannels: RealtimeChannel[] = []

  for (const chId of chatIds) {
    if (allowedChatIds.has(chId)) {
      chatChannels.push(`chat:${chId}`)
    } else {
      logger.warn('Realtime token: skipping unauthorized chat', { userId: user.userId, chatId: chId }, 'Realtime')
    }
  }

  // Only allow explicitly known public channels from the request
  const requestedPublic = requestedChannels.filter((ch) =>
    PUBLIC_CHANNELS.includes(ch)
  )

  const finalChannels = dedupe([
    ...baseChannels,
    ...requestedPublic,
    ...chatChannels,
  ])

  if (finalChannels.length === 0) {
    return NextResponse.json(
      { error: 'No channels authorized' },
      { status: 403 }
    )
  }

  const token = issueRealtimeToken({
    userId: user.userId,
    channels: finalChannels,
    ttlSeconds: ttlSeconds ?? 900,
  })

  const expiresAt =
    Date.now() + (ttlSeconds ?? 900) * 1000

  logger.info('Issued realtime token', { userId: user.userId, channels: finalChannels }, 'Realtime')

  return NextResponse.json({
    token,
    channels: finalChannels,
    expiresAt,
  })
}
