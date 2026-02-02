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

export async function sendSponsoredEvmTransaction({
  userJwt,
  walletId,
  to,
  data,
  valueWei,
  caip2 = `eip155:${CHAIN.id}`,
  chainId = CHAIN.id,
}: SendSponsoredEvmTransactionInput): Promise<{ hash: Hex; caip2: string }> {
  const privy = getPrivyNodeClient();

  const authorizationContext: AuthorizationContext = {
    user_jwts: [userJwt],
  };

  const valueHex =
    typeof valueWei === 'bigint' ? `0x${valueWei.toString(16)}` : undefined;

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
