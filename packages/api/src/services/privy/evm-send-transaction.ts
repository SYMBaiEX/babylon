import { CHAIN, logger } from '@babylon/shared';
import type { AuthorizationContext } from '@privy-io/node';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import type { Address, Hex } from 'viem';
import { z } from 'zod';
import { getPrivyNodeClient } from './privy-node';

export type SendSponsoredEvmTransactionInput = {
  userJwt: string;
  /**
   * Optional fallback tokens (e.g. cookie token vs freshly-refreshed token).
   * These are tried only if the primary token is rejected by Privy's wallet endpoint.
   */
  userJwtFallbacks?: string[];
  /**
   * Optional safety check: require that the JWT subject matches the expected Privy user id.
   * Use this when the caller already verified auth and knows the `privyId`.
   */
  expectedPrivyUserId?: string;
  walletId: string;
  to: Address;
  data?: Hex;
  valueWei?: bigint;
  caip2?: string;
  chainId?: number;
};

/**
 * Runtime schema for a Privy JWT payload.
 * See: https://docs.privy.io/guide/server/authorization/verification
 */
export const PrivyJwtPayloadSchema = z.object({
  /** Audience - the Privy app ID this token was issued for */
  aud: z.union([z.string(), z.array(z.string())]),
  /** Subject - the Privy user ID (did:privy:...) */
  sub: z.string(),
  /** Issuer - Privy's issuer URL */
  iss: z.string(),
  /** Issued at timestamp (seconds since epoch) */
  iat: z.number(),
  /** Expiration timestamp (seconds since epoch) */
  exp: z.number(),
  /** Session ID */
  sid: z.string().optional(),
});

export type PrivyJwtPayload = z.infer<typeof PrivyJwtPayloadSchema>;

/**
 * Safely decodes and validates a JWT header using `jose`.
 * Returns null if the token is malformed.
 */
export function safeDecodeJwtHeader(token: string) {
  try {
    return decodeProtectedHeader(token);
  } catch {
    return null;
  }
}

/**
 * Safely decodes and validates a JWT payload using `jose` for decoding
 * and Zod for runtime type validation.
 *
 * Used only to extract claims for pre-flight validation before Privy API calls.
 * Actual token verification is performed by Privy's SDK.
 */
export function safeDecodeJwtPayload(token: string): PrivyJwtPayload | null {
  try {
    const raw = decodeJwt(token);
    const result = PrivyJwtPayloadSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function isInvalidPrivyWalletJwtError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Privy wallet endpoints currently surface this message for invalid/revoked JWTs.
  // Keep the match strict to avoid retrying on unrelated failures.
  return error.message.toLowerCase().includes('invalid jwt token provided');
}

function dedupeNonEmptyStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
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
  userJwtFallbacks,
  expectedPrivyUserId,
  walletId,
  to,
  data,
  valueWei,
  caip2 = `eip155:${CHAIN.id}`,
  chainId = CHAIN.id,
}: SendSponsoredEvmTransactionInput): Promise<{ hash: Hex; caip2: string }> {
  const jwtCandidates = dedupeNonEmptyStrings([
    userJwt,
    ...(userJwtFallbacks ?? []),
  ]);
  if (jwtCandidates.length === 0) {
    throw new Error('Missing Privy user JWT');
  }

  const appId =
    process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Pre-flight validate candidates (decode-only) so we can skip obviously-invalid tokens
  // without paying for a wallet API call.
  const parsedBuffer = Number(process.env.PRIVY_JWT_EXPIRY_BUFFER_SECONDS);
  const expiryBuffer =
    Number.isFinite(parsedBuffer) && parsedBuffer > 0 ? parsedBuffer : 30;

  const invalidJwtError = new Error(
    'Invalid Privy user JWT: token must be a valid JWT with the expected Privy claims (aud, sub, iss, iat, exp)'
  );

  const candidates: Array<{ token: string; payload: PrivyJwtPayload }> = [];
  let firstValidationError: Error | undefined;
  let lastValidationError: Error | undefined;
  for (const token of jwtCandidates) {
    const payload = safeDecodeJwtPayload(token);
    if (!payload) {
      // Preserve the previous error message semantics for single-token calls.
      lastValidationError = invalidJwtError;
      if (!firstValidationError) firstValidationError = invalidJwtError;
      continue;
    }

    if (expectedPrivyUserId && payload.sub !== expectedPrivyUserId) {
      const err = new Error(
        'Privy token subject mismatch: token does not match the authenticated user'
      );
      lastValidationError = err;
      if (!firstValidationError) firstValidationError = err;
      continue;
    }

    if (!payload.exp) {
      const err = new Error(
        'Privy JWT is missing an expiration claim (exp). Cannot authorize wallet operations without a verifiable token lifetime.'
      );
      lastValidationError = err;
      if (!firstValidationError) firstValidationError = err;
      continue;
    }

    if (payload.exp < Date.now() / 1000 + expiryBuffer) {
      const err = new Error(
        `Privy JWT is expired or about to expire (exp: ${new Date(payload.exp * 1000).toISOString()}). Please refresh your session.`
      );
      lastValidationError = err;
      if (!firstValidationError) firstValidationError = err;
      continue;
    }

    if (appId) {
      const tokenAud = payload.aud;
      const audMatches =
        tokenAud === appId ||
        (Array.isArray(tokenAud) && tokenAud.includes(appId));
      if (!audMatches) {
        const err = new Error(
          `Privy token audience mismatch: token audience "${tokenAud}" does not match app ID "${appId}"`
        );
        lastValidationError = err;
        if (!firstValidationError) firstValidationError = err;
        continue;
      }
    }

    candidates.push({ token, payload });
  }

  if (candidates.length === 0) {
    // Preserve clear, single-cause error semantics for callers/tests.
    throw firstValidationError ?? lastValidationError ?? invalidJwtError;
  }

  // Debug: Log JWT header + claims to diagnose auth issues (no sensitive identifiers).
  // Only log for the first candidate we will try.
  const first = candidates[0];
  const jwtHeader = safeDecodeJwtHeader(first.token);
  logger.debug(
    'Privy JWT diagnostics',
    {
      alg: jwtHeader?.alg,
      typ: jwtHeader?.typ,
      kid: jwtHeader?.kid,
      iss: first.payload.iss,
      aud: first.payload.aud,
      iat: first.payload.iat,
      exp: first.payload.exp,
      isExpired: first.payload.exp
        ? first.payload.exp < Date.now() / 1000
        : 'no-exp',
      configuredAppId: appId,
      candidatesCount: candidates.length,
      jwtLength: first.token.length,
      expectedPrivyUserId: expectedPrivyUserId ? 'provided' : 'not-provided',
    },
    'sendSponsoredEvmTransaction'
  );

  if (!appId) {
    logger.warn(
      'PRIVY_APP_ID is not configured — skipping JWT audience validation. Set PRIVY_APP_ID or NEXT_PUBLIC_PRIVY_APP_ID to enable.',
      {},
      'sendSponsoredEvmTransaction'
    );
  }

  const privy = getPrivyNodeClient();

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

  let lastError: unknown;
  for (const { token } of candidates) {
    const authorizationContext: AuthorizationContext = {
      user_jwts: [token],
    };

    try {
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
    } catch (error) {
      lastError = error;
      // Only retry on the specific auth failure we expect for token rotation/revocation.
      if (!isInvalidPrivyWalletJwtError(error)) {
        throw error;
      }
      // Continue to next candidate (if any).
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to submit sponsored transaction via Privy');
}
