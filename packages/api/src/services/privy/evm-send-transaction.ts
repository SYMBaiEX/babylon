import { CHAIN, logger } from '@babylon/shared';
import type { AuthorizationContext } from '@privy-io/node';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import type { Address, Hex } from 'viem';
import { z } from 'zod';
import { extractPrivyApiDiagnostics } from './error-diagnostics';
import { getPrivyOfflineConfig } from './offline-config';
import { getPrivyNodeClient } from './privy-node';

export type SendSponsoredEvmTransactionInput = {
  walletId: string;
  to: Address;
  data?: Hex;
  valueWei?: bigint;
  caip2?: string;
  chainId?: number;
  idempotencyKey?: string;
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

/**
 * Sends a sponsored EVM transaction on behalf of a user via Privy's server-side wallet flow.
 *
 * Gas is covered by Privy's native sponsorship (`sponsor: true`), but any ETH value
 * transfers still require the user's wallet to hold sufficient funds.
 *
 * @param walletId - The Privy wallet resource ID (stored in users.privyWalletId)
 * @param to - The destination contract/address
 * @param data - Optional encoded function call data
 * @param valueWei - Optional ETH value to transfer (in wei)
 * @param caip2 - Optional CAIP-2 chain identifier (defaults to current chain)
 * @param chainId - Optional numeric chain ID (defaults to current chain)
 * @returns Transaction hash and CAIP-2 identifier
 */
export async function sendSponsoredEvmTransaction({
  walletId,
  to,
  data,
  valueWei,
  caip2 = `eip155:${CHAIN.id}`,
  chainId = CHAIN.id,
  idempotencyKey,
}: SendSponsoredEvmTransactionInput): Promise<{ hash: Hex; caip2: string }> {
  const offlineConfig = getPrivyOfflineConfig();
  const appId = offlineConfig.appId;

  const privy = getPrivyNodeClient();
  const authorizationPrivateKey = offlineConfig.authorizationPrivateKey;

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
      appId,
      walletId,
      to,
      chainId,
      hasData: !!data,
      hasValue: !!valueHex,
      valueWei: valueWei?.toString(),
      hasIdempotencyKey: Boolean(idempotencyKey),
    },
    'sendSponsoredEvmTransaction'
  );

  const authorizationContext: AuthorizationContext = {
    authorization_private_keys: [authorizationPrivateKey],
  };

  try {
    const response = await privy
      .wallets()
      .ethereum()
      .sendTransaction(walletId, {
        caip2,
        sponsor: true,
        authorization_context: authorizationContext,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
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
    const diagnostics = extractPrivyApiDiagnostics(error);

    logger.error(
      'Failed to submit offline sponsored transaction',
      {
        caip2,
        chainId,
        walletId,
        to,
        ...diagnostics,
      },
      'sendSponsoredEvmTransaction'
    );

    throw error instanceof Error
      ? error
      : new Error('Failed to submit sponsored transaction via Privy');
  }
}
