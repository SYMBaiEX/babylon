/**
 * SIWE (Sign-In With Ethereum) Authentication
 *
 * @description Provides EIP-4361 SIWE authentication for agent registration.
 * Handles nonce generation/validation and signature verification.
 *
 * @see https://eips.ethereum.org/EIPS/eip-4361
 */

import { logger } from '@babylon/shared';
import {
  SiweErrorType,
  SiweMessage,
  generateNonce as siweGenerateNonce,
} from 'siwe';
import { getAddress } from 'viem';
import { getRedis } from '../redis/client';

/** Nonce TTL in seconds (5 minutes) */
const NONCE_TTL_SECONDS = 300;

/** Redis key prefix for SIWE nonces */
const NONCE_PREFIX = 'siwe:nonce:';

/** In-memory nonce store fallback */
const memoryNonceStore = new Map<string, number>();

/**
 * Get the expected domain for SIWE messages.
 */
export function getExpectedDomain(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return new URL(appUrl).hostname;
}

/**
 * Get the full app URL for SIWE URI field.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export interface NonceResponse {
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  domain: string;
}

/**
 * Generate a new SIWE nonce.
 */
export async function generateNonce(): Promise<NonceResponse> {
  const nonce = siweGenerateNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000);

  const redis = getRedis();
  if (redis) {
    await redis.setex(`${NONCE_PREFIX}${nonce}`, NONCE_TTL_SECONDS, '1');
  } else {
    logger.warn('Redis unavailable - using in-memory nonce store', {}, 'SIWE');
    memoryNonceStore.set(nonce, expiresAt.getTime());
    setTimeout(() => memoryNonceStore.delete(nonce), NONCE_TTL_SECONDS * 1000);
  }

  return { nonce, issuedAt, expiresAt, domain: getExpectedDomain() };
}

/**
 * Consume a SIWE nonce (single-use).
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const deleted = await redis.del(`${NONCE_PREFIX}${nonce}`);
    return deleted > 0;
  }
  const expiresAt = memoryNonceStore.get(nonce);
  if (!expiresAt || Date.now() > expiresAt) return false;
  memoryNonceStore.delete(nonce);
  return true;
}

export interface SiweVerifySuccess {
  success: true;
  address: string;
}

export interface SiweVerifyFailure {
  success: false;
  error:
    | 'invalid_nonce'
    | 'invalid_domain'
    | 'invalid_signature'
    | 'expired_message';
}

export type SiweVerifyResult = SiweVerifySuccess | SiweVerifyFailure;

/**
 * Verify a SIWE message signature.
 */
export async function verifySiweMessage(
  message: string,
  signature: string
): Promise<SiweVerifyResult> {
  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch (err) {
    logger.warn(
      'SIWE message parse failed',
      { error: err instanceof Error ? err.message : String(err) },
      'SIWE'
    );
    return { success: false, error: 'invalid_signature' };
  }

  const expectedDomain = getExpectedDomain();

  if (siweMessage.domain !== expectedDomain) {
    logger.warn(
      'SIWE domain mismatch',
      { expected: expectedDomain, received: siweMessage.domain },
      'SIWE'
    );
    return { success: false, error: 'invalid_domain' };
  }

  const nonceValid = await consumeNonce(siweMessage.nonce);
  if (!nonceValid) {
    return { success: false, error: 'invalid_nonce' };
  }

  const verifyResponse = await siweMessage.verify(
    {
      signature,
      domain: expectedDomain,
      time: new Date().toISOString(),
    },
    { suppressExceptions: true }
  );

  if (!verifyResponse.success) {
    const errorType =
      verifyResponse.error &&
      typeof verifyResponse.error === 'object' &&
      'type' in verifyResponse.error
        ? verifyResponse.error.type
        : undefined;

    if (errorType === SiweErrorType.EXPIRED_MESSAGE) {
      return { success: false, error: 'expired_message' };
    }

    logger.warn(
      'SIWE verification failed',
      {
        error:
          verifyResponse.error instanceof Error
            ? verifyResponse.error.message
            : typeof verifyResponse.error === 'string'
              ? verifyResponse.error
              : (errorType ?? 'unknown'),
      },
      'SIWE'
    );
    return { success: false, error: 'invalid_signature' };
  }

  return { success: true, address: getAddress(verifyResponse.data.address) };
}

/**
 * Create a SIWE message for testing.
 */
export function createSiweMessage(params: {
  address: string;
  nonce: string;
  statement?: string;
  chainId?: number;
}): string {
  const siweMessage = new SiweMessage({
    domain: getExpectedDomain(),
    address: params.address,
    statement: params.statement ?? 'Register as agent on Babylon',
    uri: getAppUrl(),
    version: '1',
    chainId: params.chainId ?? 1,
    nonce: params.nonce,
    issuedAt: new Date().toISOString(),
  });
  return siweMessage.prepareMessage();
}
