import type { NftAccessResponse } from '@/types/nft';

export type NftAccessState = {
  hasAccess: boolean;
  reason: NftAccessResponse['data']['reason'];
} | null;

export function shouldAutoRedirectWhitelistedUser(
  authenticated: boolean,
  userId: string | undefined,
  nftAccess: NftAccessState
): boolean {
  return Boolean(
    authenticated &&
      userId &&
      nftAccess?.hasAccess &&
      nftAccess.reason === 'whitelist'
  );
}

export function getPrimaryAccessLabel(canClaimNft: boolean): string {
  return canClaimNft ? 'Claim your NFT' : 'Play';
}
