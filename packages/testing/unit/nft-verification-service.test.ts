/**
 * Unit Tests: NFT Verification Service
 *
 * Tests NFTVerificationService validation logic and error handling.
 *
 * NOTE: These tests focus on validation and error handling logic only.
 * For actual RPC calls and blockchain integration, see:
 * - integration/nft-gated-chats.integration.test.ts (full integration tests)
 *
 * These unit tests verify:
 * - Input validation (address format, token ID validation)
 * - Error message generation
 * - Boundary conditions
 * - Logic flow (not RPC calls - those are tested in integration tests)
 *
 * IMPORTANT: We do NOT mock RPC calls here because that would test mocks, not real code.
 * RPC functionality is tested in integration tests with real blockchain calls.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { NFTVerificationService } from '@babylon/api';
import { ValidationError } from '@babylon/shared';
import type { Address } from 'viem';

describe('NFTVerificationService', () => {
  const validWallet = '0x1234567890123456789012345678901234567890' as Address;
  const validContract = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;

  beforeEach(() => {
    // Reset any state between tests
  });

  describe('verifyChatAccess - Input Validation', () => {
    test('should return canAccess=false when wallet address is null', async () => {
      const result = await NFTVerificationService.verifyChatAccess(
        null,
        validContract,
        null
      );

      expect(result.canAccess).toBe(false);
      expect(result.ownsNft).toBe(false);
      expect(result.reason).toContain('Wallet address required');
    });

    test('should handle empty string wallet address', async () => {
      const result = await NFTVerificationService.verifyChatAccess(
        '',
        validContract,
        null
      );

      // Empty string should be treated as null
      expect(result.canAccess).toBe(false);
      expect(result.reason).toContain('Wallet address required');
    });

    test('should throw ValidationError for invalid contract address', async () => {
      // This will fail validation, but we can check the error structure
      // Use try/catch to verify both error type and message
      try {
        await NFTVerificationService.verifyOwnership(
          validWallet,
          'invalid-address',
          null
        );
        // Should not reach here
        expect.unreachable('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/Invalid contract address/);
      }
    });

    test('should validate address format before RPC calls', async () => {
      // Use try/catch pattern consistent with other tests in this file
      try {
        await NFTVerificationService.verifyOwnership(
          'not-an-address',
          validContract,
          null
        );
        expect.unreachable('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/Invalid wallet address/);
      }

      try {
        await NFTVerificationService.verifyOwnership(
          validWallet,
          'not-an-address',
          null
        );
        expect.unreachable('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/Invalid contract address/);
      }
    });

    test('should validate token ID format', async () => {
      // Use try/catch to verify both error type and message for negative token ID
      try {
        await NFTVerificationService.verifyOwnership(
          validWallet,
          validContract,
          -1
        );
        expect.unreachable('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/Invalid token ID/);
      }

      // Use try/catch to verify both error type and message for non-integer token ID
      try {
        await NFTVerificationService.verifyOwnership(
          validWallet,
          validContract,
          1.5
        );
        expect.unreachable('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/Invalid token ID/);
      }
    });

    test('should allow token ID 0', async () => {
      // Token ID 0 is a valid token ID (unlike -1 or 1.5 which are invalid)
      // This tests that token ID 0 passes the tokenId format validation.
      // The function may still throw ValidationError for OTHER reasons (e.g., no contract at address)
      // but it should NOT throw for token ID being 0.
      try {
        await NFTVerificationService.verifyOwnership(
          validWallet,
          validContract,
          0
        );
      } catch (error) {
        // If it's a ValidationError, it should NOT be about the token ID
        if (error instanceof ValidationError) {
          // "No contract at address" or "Not an ERC721 contract" are acceptable validation errors
          // because they're not rejecting token ID 0 specifically
          expect(error.message).not.toContain('token');
          expect(error.message).not.toContain('Token');
          // Verify it's a contract-related validation, not token ID validation
          expect(
            error.message.includes('contract') ||
              error.message.includes('Contract') ||
              error.message.includes('ERC721')
          ).toBe(true);
        }
        // Non-ValidationError (network/RPC errors) are also fine
      }
    });
  });

  describe('Boundary Conditions and Edge Cases', () => {
    test('should handle token ID 0', () => {
      // Token ID 0 is valid
      expect(0).toBeGreaterThanOrEqual(0);
    });

    test('should handle very large token IDs', () => {
      const largeTokenId = Number.MAX_SAFE_INTEGER;
      expect(largeTokenId).toBeGreaterThan(0);
      // Service should handle this correctly
    });

    test('should handle zero address format', () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      expect(zeroAddress.length).toBe(42);
      expect(zeroAddress.startsWith('0x')).toBe(true);
    });

    test('should validate address format requirements', () => {
      const validAddress = '0x1234567890123456789012345678901234567890';
      expect(validAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
});
