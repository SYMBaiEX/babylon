import { CHAIN } from '@babylon/shared';
import type { AuthorizationContext } from '@privy-io/node';
import type { Address, Hex } from 'viem';
import { getPrivyNodeClient } from './privy-node';

export type SendSponsoredEvmTransactionInput = {
  userJwt: string;
  walletId: string;
  to: Address;
  data?: Hex;
  valueWei?: bigint;
  caip2?: string;
  chainId?: number;
};

/**
 * Expected structure of a Privy JWT payload.
 * See: https://docs.privy.io/guide/server/authorization/verification
 */
interface PrivyJwtPayload {
  /** Audience - the Privy app ID this token was issued for */
  aud: string | string[];
  /** Subject - the Privy user ID (did:privy:...) */
  sub: string;
  /** Issuer - Privy's issuer URL */
  iss: string;
  /** Issued at timestamp (seconds since epoch) */
  iat: number;
  /** Expiration timestamp (seconds since epoch) */
  exp: number;
  /** Session ID */
  sid?: string;
}

/**
 * Decodes a JWT payload without verification.
 * Used only to extract claims for pre-flight validation before Privy API calls.
 * Actual token verification is performed by Privy's SDK.
 */
function decodeJwtPayload(token: string): PrivyJwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
    return JSON.parse(json) as PrivyJwtPayload;
  } catch {
    return null;
  }
}

export async function sendSponsoredEvmTransaction({
  userJwt,
  walletId,
  to,
  data,
  valueWei,
  caip2 = `eip155:${CHAIN.id}`,
  chainId = CHAIN.id,
}: SendSponsoredEvmTransactionInput): Promise<{ hash: Hex; caip2: string }> {
  const payload = decodeJwtPayload(userJwt);
  if (!payload) {
    throw new Error(
      'Invalid Privy user JWT format. Ensure you are passing a Privy access token (JWT).'
    );
  }

  const tokenAud = payload.aud;
  const appId =
    process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (typeof appId === 'string') {
    const audMatches =
      tokenAud === appId ||
      (Array.isArray(tokenAud) && tokenAud.includes(appId));
    if (!audMatches) {
      throw new Error(
        'Privy token audience mismatch. Ensure PRIVY_APP_ID / NEXT_PUBLIC_PRIVY_APP_ID matches the token issuer app.'
      );
    }
  }

  const privy = getPrivyNodeClient();

  const authorizationContext: AuthorizationContext = {
    user_jwts: [userJwt],
  };

  // Only include value in transaction params if it's a positive bigint.
  // Zero-value transactions should omit the value field entirely to avoid
  // potential issues with Privy's API expecting undefined for zero-value calls.
  const valueHex =
    typeof valueWei === 'bigint' && valueWei > 0n
      ? `0x${valueWei.toString(16)}`
      : undefined;

  const response = await privy
    .wallets()
    .ethereum()
    .sendTransaction(walletId, {
      caip2,
      sponsor: true,
      authorization_context: authorizationContext,
      params: {
        transaction: {
          to,
          chain_id: chainId,
          ...(valueHex ? { value: valueHex } : {}),
          ...(data ? { data } : {}),
        },
      },
    });

  return { hash: response.hash as Hex, caip2: response.caip2 };
}
