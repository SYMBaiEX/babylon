import { describe, expect, it } from 'bun:test';
import {
  getPrimaryAccessLabel,
  shouldAutoRedirectWhitelistedUser,
  type NftAccessState,
} from './comingSoonAccess';

describe('comingSoonAccess', () => {
  describe('shouldAutoRedirectWhitelistedUser', () => {
    it('returns true for authenticated whitelist users with access', () => {
      const nftAccess: NftAccessState = {
        hasAccess: true,
        reason: 'whitelist',
      };

      expect(
        shouldAutoRedirectWhitelistedUser(true, 'user-1', nftAccess)
      ).toBe(true);
    });

    it('returns false for non-whitelist access reasons', () => {
      const snapshotAccess: NftAccessState = {
        hasAccess: true,
        reason: 'snapshot_2025',
      };

      expect(
        shouldAutoRedirectWhitelistedUser(true, 'user-1', snapshotAccess)
      ).toBe(false);
    });

    it('returns false when user is not authenticated or has no user id', () => {
      const whitelistAccess: NftAccessState = {
        hasAccess: true,
        reason: 'whitelist',
      };

      expect(
        shouldAutoRedirectWhitelistedUser(false, 'user-1', whitelistAccess)
      ).toBe(false);
      expect(
        shouldAutoRedirectWhitelistedUser(true, undefined, whitelistAccess)
      ).toBe(false);
    });
  });

  describe('getPrimaryAccessLabel', () => {
    it('returns claim label when NFT can be claimed', () => {
      expect(getPrimaryAccessLabel(true)).toBe('Claim your NFT');
    });

    it('returns play label when NFT cannot be claimed', () => {
      expect(getPrimaryAccessLabel(false)).toBe('Play');
    });
  });
});
