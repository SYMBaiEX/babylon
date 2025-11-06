import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingIntent, OnboardingStatus } from '@prisma/client'
import { ConflictError } from '@/lib/errors'
import { OnboardingProfileService } from '../profile-service'
import { OnboardingIntentService } from '../intent-service'

type UserRecord = {
  id: string
  username: string | null
  displayName: string | null
  bio: string | null
  profileImageUrl: string | null
  coverImageUrl: string | null
  profileComplete: boolean
  hasUsername: boolean
  hasBio: boolean
  hasProfileImage: boolean
}

type IntentRecord = OnboardingIntent

const state = {
  intents: new Map<string, IntentRecord>(),
  users: new Map<string, UserRecord>(),
}

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))

const createIntent = (overrides: Partial<IntentRecord> = {}): IntentRecord => {
  const now = new Date()
  return {
    id: 'intent-1',
    userId: 'user-1',
    status: 'PENDING_PROFILE',
    referralCode: null,
    payload: null,
    profileApplied: false,
    profileCompletedAt: null,
    onchainStartedAt: null,
    onchainCompletedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const createUser = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: 'user-1',
  username: 'user_alpha',
  displayName: 'User Alpha',
  bio: '',
  profileImageUrl: null,
  coverImageUrl: null,
  profileComplete: false,
  hasUsername: false,
  hasBio: false,
  hasProfileImage: false,
  ...overrides,
})

const resetState = (intentOverrides: Partial<IntentRecord> = {}, userOverrides: Partial<UserRecord> = {}) => {
  state.intents.clear()
  state.users.clear()
  const intent = createIntent(intentOverrides)
  const user = createUser(userOverrides)
  state.intents.set(intent.id, intent)
  state.users.set(user.id, user)
}

const applyIntentUpdates = (intentId: string, data: Partial<IntentRecord>) => {
  const current = state.intents.get(intentId)
  if (!current) throw new Error(`Intent ${intentId} not found`)
  const updated = {
    ...current,
    ...data,
  }
  state.intents.set(intentId, updated)
  return clone(updated)
}

const prismaMock = {
  onboardingIntent: {
    findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
      if (where.id) {
        return clone(state.intents.get(where.id) ?? null)
      }
      if (where.userId) {
        const match = [...state.intents.values()].find((intent) => intent.userId === where.userId)
        return match ? clone(match) : null
      }
      return null
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const match = state.intents.get(where.id)
      if (!match) {
        throw new Error(`Intent ${where.id} not found`)
      }
      return clone(match)
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<IntentRecord> }) => {
      return applyIntentUpdates(where.id, { ...data, updatedAt: new Date() })
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; status?: { in: OnboardingStatus[] } | OnboardingStatus }
      data: Partial<IntentRecord>
    }) => {
      // Uncomment for debugging:
      // console.log('updateMany where', where, 'current status', state.intents.get(where.id ?? '')?.status)
      let count = 0
      for (const intent of state.intents.values()) {
        if (where.id && intent.id !== where.id) continue
        if (typeof where.status === 'string' && intent.status !== where.status) continue
        if (typeof where.status === 'object' && 'in' in where.status && !where.status.in.includes(intent.status)) continue
        applyIntentUpdates(intent.id, { ...data, updatedAt: new Date() })
        count += 1
      }
      return { count }
    },
    create: async ({ data }: { data: IntentRecord }) => {
      state.intents.set(data.id, data)
      return clone(data)
    },
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return clone(state.users.get(where.id) ?? null)
    },
    findFirst: async ({ where }: { where: { username?: string; id?: { not?: string } } }) => {
      const { username, id } = where
      for (const user of state.users.values()) {
        if (username && user.username !== username) continue
        if (id?.not && user.id === id.not) continue
        if (username) {
          return clone({ id: user.id })
        }
      }
      return null
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRecord> }) => {
      const current = state.users.get(where.id)
      if (!current) throw new Error(`User ${where.id} not found`)
      const updated: UserRecord = {
        ...current,
        ...data,
      }
      state.users.set(where.id, updated)
      return clone({
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        bio: updated.bio,
        profileImageUrl: updated.profileImageUrl,
        coverImageUrl: updated.coverImageUrl,
        profileComplete: updated.profileComplete,
        hasUsername: updated.hasUsername,
        hasBio: updated.hasBio,
        hasProfileImage: updated.hasProfileImage,
      })
    },
  },
  $transaction: async <T>(callback: (tx: typeof prismaMock) => Promise<T>) => callback(prismaMock),
}

vi.mock('@/lib/database-service', () => ({
  prisma: prismaMock,
}))

describe('Onboarding profile flow', () => {
  beforeEach(() => {
    resetState()
  })

  it('allows resubmitting the profile payload without errors', async () => {
    const payload = {
      username: 'user_alpha',
      displayName: 'User Alpha',
      bio: 'Hello Babylon',
      profileImageUrl: 'https://example.com/avatar.png',
      coverImageUrl: null,
    }

    const baseIntent = clone(state.intents.get('intent-1')!)

    const first = await OnboardingProfileService.applyProfile(baseIntent, payload)
    expect(first.intent.status).toBe('PENDING_ONCHAIN')
    expect(first.intent.profileApplied).toBe(true)
    expect(first.user.hasUsername).toBe(true)
    expect(first.user.profileComplete).toBe(true)

    const second = await OnboardingProfileService.applyProfile(first.intent, payload)
    expect(second.intent.status).toBe('PENDING_ONCHAIN')
    expect(second.intent.profileApplied).toBe(true)
  })

  it('rejects profile updates when intent is in progress or completed', async () => {
    const payload = {
      username: 'user_alpha',
      displayName: 'User Alpha',
      bio: 'Hello Babylon',
    }
    applyIntentUpdates('intent-1', { status: 'ONCHAIN_IN_PROGRESS' })
    const baseIntent = clone(state.intents.get('intent-1')!)
    await expect(OnboardingProfileService.applyProfile(baseIntent, payload)).rejects.toThrow(ConflictError)

    applyIntentUpdates('intent-1', { status: 'COMPLETED' })
    await expect(OnboardingProfileService.applyProfile(baseIntent, payload)).rejects.toThrow(ConflictError)
  })

  it('enforces safe state transitions for on-chain retries', async () => {
    applyIntentUpdates('intent-1', { status: 'PENDING_ONCHAIN' })
    const moveToInProgress = await OnboardingIntentService.transition(
      'intent-1',
      'ONCHAIN_IN_PROGRESS',
      {},
      { allowFrom: ['PENDING_ONCHAIN'] }
    )
    expect(moveToInProgress.status).toBe('ONCHAIN_IN_PROGRESS')

    const failedIntent = await OnboardingIntentService.recordFailure('intent-1', new Error('boom'))
    expect(failedIntent.status).toBe('ONCHAIN_FAILED')
    expect(failedIntent.lastError).not.toBeNull()

    const retry = await OnboardingIntentService.transition(
      'intent-1',
      'ONCHAIN_IN_PROGRESS',
      {},
      { allowFrom: ['PENDING_ONCHAIN', 'ONCHAIN_FAILED'] }
    )
    expect(retry.status).toBe('ONCHAIN_IN_PROGRESS')

    const completion = await OnboardingIntentService.transition(
      'intent-1',
      'COMPLETED',
      {},
      { allowFrom: ['ONCHAIN_IN_PROGRESS'] }
    )
    expect(completion.status).toBe('COMPLETED')
    expect(state.intents.get('intent-1')!.status).toBe('COMPLETED')

    await expect(
      OnboardingIntentService.transition('intent-1', 'ONCHAIN_IN_PROGRESS', {}, { allowFrom: ['PENDING_ONCHAIN'] })
    ).rejects.toThrow(ConflictError)
    await expect(OnboardingIntentService.recordFailure('intent-1', new Error('noop'))).rejects.toThrow(ConflictError)
  })
})
