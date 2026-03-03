import { describe, expect, it } from 'bun:test';
import {
  extractPrivyIdentitySnapshot,
  shouldSyncMissingPrivyIdentity,
} from '@/lib/auth/privyIdentitySync';

describe('privyIdentitySync', () => {
  it('extracts identity fields from Privy user payload', () => {
    const snapshot = extractPrivyIdentitySnapshot({
      email: { address: 'alice@example.com' },
      farcaster: { username: 'alice', fid: 12345 },
      twitter: { username: 'alice_x', subject: 'tw_123' },
    } as never);

    expect(snapshot).toEqual({
      email: 'alice@example.com',
      farcasterUsername: 'alice',
      farcasterFid: '12345',
      twitterUsername: 'alice_x',
      twitterId: 'tw_123',
    });
  });

  it('returns nulls for missing linked accounts', () => {
    const snapshot = extractPrivyIdentitySnapshot({} as never);

    expect(snapshot).toEqual({
      email: null,
      farcasterUsername: null,
      farcasterFid: null,
      twitterUsername: null,
      twitterId: null,
    });
  });

  it('requires sync when any identity field is still missing locally', () => {
    expect(
      shouldSyncMissingPrivyIdentity({
        hasFarcaster: false,
        hasTwitter: true,
        email: 'a@example.com',
        emailVerified: true,
      })
    ).toBe(true);

    expect(
      shouldSyncMissingPrivyIdentity({
        hasFarcaster: true,
        hasTwitter: true,
        email: null,
        emailVerified: false,
      })
    ).toBe(true);
  });

  it('skips sync when local identity is fully populated', () => {
    expect(
      shouldSyncMissingPrivyIdentity({
        hasFarcaster: true,
        hasTwitter: true,
        email: 'a@example.com',
        emailVerified: true,
      })
    ).toBe(false);
  });
});
