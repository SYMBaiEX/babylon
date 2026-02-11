import { PrivyClient } from '@privy-io/node';
import { getPrivyOfflineConfig } from './offline-config';

let privyNodeClient: PrivyClient | null = null;

export function getPrivyNodeClient(): PrivyClient {
  if (privyNodeClient) return privyNodeClient;

  const { appId, appSecret } = getPrivyOfflineConfig();

  privyNodeClient = new PrivyClient({ appId, appSecret });
  return privyNodeClient;
}
