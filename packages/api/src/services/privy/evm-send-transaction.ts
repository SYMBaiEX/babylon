import { CHAIN, logger } from '@babylon/shared';
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

interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

/**
 * Decodes a JWT header without verification.
 */
function decodeJwtHeader(token: string): JwtHeader | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[0] ?? '', 'base64url').toString('utf8');
    return JSON.parse(json) as JwtHeader;
  } catch {
    return null;
  }
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

/**
 * Sends a sponsored EVM transaction on behalf of a user via Privy's server-side wallet flow.
 *
 * Gas is covered by Privy's native sponsorship (`sponsor: true`), but any ETH value
 * transfers still require the user's wallet to hold sufficient funds.
 *
 * @param userJwt - The user's Privy access token (JWT) for authorization
 * @param walletId - The Privy wallet resource ID (stored in users.privyWalletId)
 * @param to - The destination contract/address
 * @param data - Optional encoded function call data
 * @param valueWei - Optional ETH value to transfer (in wei)
 * @param caip2 - Optional CAIP-2 chain identifier (defaults to current chain)
 * @param chainId - Optional numeric chain ID (defaults to current chain)
 * @returns Transaction hash and CAIP-2 identifier
 */
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
      'Invalid Privy user JWT format: token must be a valid JWT with header.payload.signature structure'
    );
  }

  const appId =
    process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Debug: Log JWT header + claims to diagnose auth issues (no sensitive identifiers)
  const jwtHeader = decodeJwtHeader(userJwt);
  logger.debug(
    'Privy JWT diagnostics',
    {
      alg: jwtHeader?.alg,
      typ: jwtHeader?.typ,
      kid: jwtHeader?.kid,
      iss: payload.iss,
      aud: payload.aud,
      iat: payload.iat,
      exp: payload.exp,
      isExpired: payload.exp ? payload.exp < Date.now() / 1000 : 'no-exp',
      configuredAppId: appId,
      jwtLength: userJwt.length,
    },
    'sendSponsoredEvmTransaction'
  );

  // Reject tokens that are expired or about to expire.
  // The buffer is configurable via PRIVY_JWT_EXPIRY_BUFFER_SECONDS (default: 30s).
  // This catches stale tokens early with a clear error instead of letting them
  // fail at Privy's wallet API with a cryptic "400 Invalid JWT token".
  const parsedBuffer = Number(process.env.PRIVY_JWT_EXPIRY_BUFFER_SECONDS);
  const expiryBuffer =
    Number.isFinite(parsedBuffer) && parsedBuffer > 0 ? parsedBuffer : 30;
  if (payload.exp && payload.exp < Date.now() / 1000 + expiryBuffer) {
    throw new Error(
      `Privy JWT is expired or about to expire (exp: ${new Date(payload.exp * 1000).toISOString()}). Please refresh your session.`
    );
  }

  const tokenAud = payload.aud;
  if (!appId) {
    logger.warn(
      'PRIVY_APP_ID is not configured — skipping JWT audience validation. Set PRIVY_APP_ID or NEXT_PUBLIC_PRIVY_APP_ID to enable.',
      {},
      'sendSponsoredEvmTransaction'
    );
  } else if (typeof appId === 'string') {
    const audMatches =
      tokenAud === appId ||
      (Array.isArray(tokenAud) && tokenAud.includes(appId));
    if (!audMatches) {
      throw new Error(
        `Privy token audience mismatch: token audience "${tokenAud}" does not match app ID "${appId}"`
      );
    }
  }

  const privy = getPrivyNodeClient();

  const authorizationContext: AuthorizationContext = {
    user_jwts: [userJwt],
  };

  // VALUE FIELD HANDLING:
  // We omit the value field entirely for zero-value transactions rather than sending "0x0".
  // This follows the common pattern where contract calls that don't transfer ETH simply
  // don't include a value field. Privy's SDK handles this correctly - tested behavior:
  // - Omitting value: works for all contract calls (most common case)
  // - value: "0x0": also works, but adds unnecessary payload
  // - value with positive amount: required for ETH transfers
  //
  // If a contract explicitly requires value=0 to be passed (extremely rare), this would
  // need to be handled as a special case.
  const valueHex =
    typeof valueWei === 'bigint' && valueWei > 0n
      ? `0x${valueWei.toString(16)}`
      : undefined;

  logger.debug(
    'Submitting sponsored transaction via Privy',
    {
      walletId,
      to,
      chainId,
      hasData: !!data,
      hasValue: !!valueHex,
      valueWei: valueWei?.toString(),
    },
    'sendSponsoredEvmTransaction'
  );

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

  logger.info(
    'Sponsored transaction submitted successfully',
    {
      txHash: response.hash,
      caip2: response.caip2,
      walletId,
      to,
    },
    'sendSponsoredEvmTransaction'
  );

  return { hash: response.hash as Hex, caip2: response.caip2 };
}
