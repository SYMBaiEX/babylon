import { describe, expect, it } from 'bun:test';
import {
  getLinkedEmail,
  isLinkEmailFlowCancellationError,
} from './link-email-utils';

describe('link-email-utils', () => {
  describe('getLinkedEmail', () => {
    it('prefers Privy email when present', () => {
      expect(getLinkedEmail('linked@example.com', 'stored@example.com')).toBe(
        'linked@example.com'
      );
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
    it('detects the exited_auth_flow string code from useLinkAccount onError', () => {
      expect(isLinkEmailFlowCancellationError('exited_auth_flow')).toBe(true);
    });

    it('detects a PrivyClientError-shaped object with code exited_auth_flow', () => {
      const err = Object.assign(new Error('User exited link email flow'), {
        code: 'exited_auth_flow',
      });
      expect(isLinkEmailFlowCancellationError(err)).toBe(true);
    });

    it('returns false when the thrown value is not an Error instance', () => {
      expect(isLinkEmailFlowCancellationError('exited')).toBe(false);
      expect(isLinkEmailFlowCancellationError(null)).toBe(false);
      expect(isLinkEmailFlowCancellationError(42)).toBe(false);
    });

    it('returns false for plain Error without a matching code', () => {
      expect(
        isLinkEmailFlowCancellationError(new Error('Network failure'))
      ).toBe(false);
      const errWrongCode = Object.assign(new Error('other'), {
        code: 'network_error',
      });
      expect(isLinkEmailFlowCancellationError(errWrongCode)).toBe(false);
    });
  });
});
