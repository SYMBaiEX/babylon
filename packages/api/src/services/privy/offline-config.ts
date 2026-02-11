export type PrivyOfflineConfig = {
  appId: string;
  appSecret: string;
  authorizationPrivateKey: string;
  offlineSignerId: string;
  offlinePolicyId: string;
};

function getTrimmedEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getPrivyAppId(): string | undefined {
  return (
    getTrimmedEnv('PRIVY_APP_ID') ?? getTrimmedEnv('NEXT_PUBLIC_PRIVY_APP_ID')
  );
}

function formatMissingFields(missing: string[]): string {
  return missing.join(', ');
}

export function getPrivyOfflineConfig(): PrivyOfflineConfig {
  const appId = getPrivyAppId();
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
