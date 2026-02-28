import { describe, expect, it } from 'bun:test';
import {
  getLinkedEmail,
  isLinkEmailFlowCancellationError,
} from './link-email-utils';

describe('link-email-utils', () => {
  describe('getLinkedEmail', () => {
    it('prefers Privy email when present', () => {
      expect(
        getLinkedEmail('linked@example.com', 'stored@example.com')
      ).toBe('linked@example.com');
    });

    it('falls back to stored email when Privy email is missing', () => {
      expect(getLinkedEmail(undefined, 'stored@example.com')).toBe(
        'stored@example.com'
      );
      expect(getLinkedEmail('   ', 'stored@example.com')).toBe(
        'stored@example.com'
      );
    });

    it('returns null when neither source has an email', () => {
      expect(getLinkedEmail(undefined, undefined)).toBeNull();
      expect(getLinkedEmail(' ', ' ')).toBeNull();
    });
  });

  describe('isLinkEmailFlowCancellationError', () => {
    it('detects exited/cancelled flow errors', () => {
      expect(
        isLinkEmailFlowCancellationError(
          new Error('User exited link email flow')
        )
      ).toBe(true);
    });

    it('returns false for non-cancellation errors', () => {
      expect(
        isLinkEmailFlowCancellationError(new Error('Network failure'))
      ).toBe(false);
      expect(isLinkEmailFlowCancellationError('exited')).toBe(false);
    });
  });
});
