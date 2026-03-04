import { getPrivyAppIdFromEnv, getTrimmedEnv } from '../../env';

export type PrivyOfflineConfig = {
  appId: string;
  appSecret: string;
  authorizationPrivateKey: string;
  offlineSignerId: string;
  offlinePolicyId: string;
};

function formatMissingFields(missing: string[]): string {
  return missing.join(', ');
}

export function getPrivyOfflineConfig(): PrivyOfflineConfig {
  const appId = getPrivyAppIdFromEnv();
  const appSecret = getTrimmedEnv('PRIVY_APP_SECRET');
  const authorizationPrivateKey = getTrimmedEnv(
    'PRIVY_AUTHORIZATION_PRIVATE_KEY'
  );
  const offlineSignerId = getTrimmedEnv('PRIVY_OFFLINE_SIGNER_ID');
  const offlinePolicyId = getTrimmedEnv('PRIVY_OFFLINE_POLICY_ID');

  const missing: string[] = [];
  if (!appId) missing.push('PRIVY_APP_ID (or NEXT_PUBLIC_PRIVY_APP_ID)');
  if (!appSecret) missing.push('PRIVY_APP_SECRET');
  if (!authorizationPrivateKey) missing.push('PRIVY_AUTHORIZATION_PRIVATE_KEY');
  if (!offlineSignerId) missing.push('PRIVY_OFFLINE_SIGNER_ID');
  if (!offlinePolicyId) missing.push('PRIVY_OFFLINE_POLICY_ID');

  if (missing.length > 0) {
    throw new Error(
      `Privy offline configuration is incomplete: missing ${formatMissingFields(missing)}`
    );
  }

  return {
    appId: appId!,
    appSecret: appSecret!,
    authorizationPrivateKey: authorizationPrivateKey!,
    offlineSignerId: offlineSignerId!,
    offlinePolicyId: offlinePolicyId!,
  };
}

export function assertPrivyOfflineConfig(): void {
  getPrivyOfflineConfig();
}
