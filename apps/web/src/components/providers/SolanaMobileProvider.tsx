'use client';

import { useEffect, useRef } from 'react';

/**
 * Registers the Solana Mobile Wallet Adapter (MWA) on Android devices.
 *
 * MWA enables native Solana wallet connections (Phantom, Solflare, etc.)
 * on Android Chrome and within TWAs (Trusted Web Activities). This is
 * required for the Solana Mobile dApp Store distribution.
 *
 * Only registers on Android devices to avoid unnecessary overhead on
 * iOS/desktop where MWA is not supported.
 *
 * Renders nothing — this is a side-effect-only component.
 */
export function SolanaMobileProvider() {
  const hasRegistered = useRef(false);

  useEffect(() => {
    // useEffect only runs in the browser, so no need for a window check.
    if (hasRegistered.current) return;

    // MWA only works on Android Chrome (and TWAs which use Chrome's engine).
    const isAndroid = /android/i.test(globalThis.navigator?.userAgent ?? '');
    if (!isAndroid) return;

    hasRegistered.current = true;

    // Dynamic import to tree-shake on non-Android platforms.
    import('@solana-mobile/wallet-standard-mobile')
      .then(
        ({
          registerMwa,
          createDefaultAuthorizationCache,
          createDefaultChainSelector,
          createDefaultWalletNotFoundHandler,
        }) => {
          registerMwa({
            appIdentity: {
              name: 'Babylon',
              uri: 'https://play.babylon.market',
              icon: 'icons/icon-192.png',
            },
            authorizationCache: createDefaultAuthorizationCache(),
            chains: ['solana:mainnet'],
            chainSelector: createDefaultChainSelector(),
            onWalletNotFound: createDefaultWalletNotFoundHandler(),
          });
        }
      )
      .catch((err) => {
        // Non-critical — Privy embedded wallets are the fallback.
        console.warn('Failed to register Solana MWA:', err);
      });
  }, []);

  return null;
}
