'use client';

import { logger } from '@babylon/shared';
import { usePrivy } from '@privy-io/react-auth';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

/**
 * Consolidated Telegram Mini App Provider.
 *
 * Handles:
 * 1. Mini App detection (isTMA)
 * 2. SDK initialization (init, miniApp.mount, viewport.expand)
 * 3. Auto-authentication with Privy
 * 4. Back button management
 * 5. Theme syncing
 * 6. Share / close functionality
 *
 * Works seamlessly in both Telegram Mini App and standalone modes.
 * The SDK is loaded dynamically to avoid import-time side-effects on
 * non-Telegram environments.
 */

interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

interface TelegramMiniAppContextType {
  isMiniApp: boolean;
  isLoading: boolean;
  error?: string;
  user: TelegramUser | null;
  /** Share a URL via Telegram's native share sheet. */
  share: (url: string, text?: string) => void;
  /** Close the Telegram Mini App. */
  close: () => void;
}

const TelegramMiniAppContext = createContext<TelegramMiniAppContextType | null>(
  null
);

/**
 * Hook to access Telegram Mini App context.
 *
 * Must be used within TelegramMiniAppProvider. Returns Mini App
 * state including detection, user info, and platform actions.
 *
 * @returns Telegram Mini App context
 * @throws Error if used outside TelegramMiniAppProvider
 */
export function useTelegramMiniApp() {
  const context = useContext(TelegramMiniAppContext);
  if (!context)
    throw new Error(
      'useTelegramMiniApp must be used within TelegramMiniAppProvider'
    );
  return context;
}

/**
 * Telegram Mini App provider component.
 *
 * Detects Telegram Mini App environment, initializes SDK, expands the viewport,
 * handles back-button behaviour, syncs theme, and triggers Privy authentication.
 * Works transparently as a pass-through when running outside Telegram.
 */
export function TelegramMiniAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);

  const hasInitialized = useRef(false);
  const hasAttemptedLogin = useRef(false);

  // Keep a ref to the dynamically loaded SDK module so actions can use it.
  const sdkRef = useRef<typeof import('@telegram-apps/sdk-react') | null>(null);

  const { login, ready, authenticated } = usePrivy();

  // ── Detect & Initialize ──────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialize = async () => {
      try {
        // Dynamic import — only load the SDK when we actually need it.
        const sdk = await import('@telegram-apps/sdk-react');
        sdkRef.current = sdk;

        // Use isTMA('complete') for reliable environment detection (recommended
        // by docs). The 'complete' mode calls a Telegram-specific method and
        // waits for confirmation, which is more reliable than the sync check.
        const isTelegramEnv = await sdk.isTMA('complete');

        if (!isTelegramEnv) {
          logger.debug(
            'Not in Telegram Mini App context',
            {},
            'TelegramMiniApp'
          );
          setIsLoading(false);
          return;
        }

        // We're inside Telegram — initialise the SDK.
        sdk.init();

        // Use mountSync() for MiniApp and ThemeParams per v3 migration guide.
        // v3 made mounting asynchronous; mountSync() safely handles concurrent
        // mounting and avoids race conditions between components.
        if (sdk.miniApp.mountSync.isAvailable()) sdk.miniApp.mountSync();
        if (sdk.miniApp.isMounted()) {
          if (sdk.miniApp.bindCssVars.isAvailable()) sdk.miniApp.bindCssVars();
        }

        // Mount & expand the viewport.
        if (sdk.viewport.mount.isAvailable()) {
          // viewport.mount remains async in v3.
          await sdk.viewport.mount();
        }
        if (sdk.viewport.expand.isAvailable()) sdk.viewport.expand();

        // Mount theme params synchronously and bind CSS vars.
        if (sdk.themeParams.mountSync.isAvailable())
          sdk.themeParams.mountSync();
        if (sdk.themeParams.bindCssVars.isAvailable())
          sdk.themeParams.bindCssVars();

        // Extract user from launch data.
        // SDK v3 returns properties with tgWebApp prefix; user fields may
        // be typed loosely, so we defensively cast.
        let extractedUsername: string | undefined;
        try {
          const lp = sdk.retrieveLaunchParams();
          const initData = lp?.tgWebAppData as
            | { user?: Record<string, unknown> }
            | undefined;
          if (initData?.user) {
            const u = initData.user;
            extractedUsername =
              u.username != null ? String(u.username) : undefined;
            setTelegramUser({
              id: Number(u.id),
              firstName: String(u.firstName ?? u.first_name ?? ''),
              lastName:
                u.lastName != null || u.last_name != null
                  ? String(u.lastName ?? u.last_name)
                  : undefined,
              username: extractedUsername,
              photoUrl:
                u.photoUrl != null || u.photo_url != null
                  ? String(u.photoUrl ?? u.photo_url)
                  : undefined,
            });
          }
        } catch {
          // Could not extract user — non-critical.
        }

        setIsMiniApp(true);

        logger.info(
          'Telegram Mini App initialized',
          { user: extractedUsername },
          'TelegramMiniApp'
        );

        // Signal to Telegram that the app is ready to be shown.
        if (sdk.miniApp.ready.isAvailable()) sdk.miniApp.ready();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          'Telegram Mini App initialization failed',
          { error: message },
          'TelegramMiniApp'
        );
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-login via Privy ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isMiniApp || !ready || authenticated || isLoading) return;
    if (hasAttemptedLogin.current) return;
    hasAttemptedLogin.current = true;

    logger.info(
      'Attempting Telegram Mini App auto-login via Privy',
      { telegramUserId: telegramUser?.id },
      'TelegramMiniApp'
    );

    // Trigger Privy's login modal. Because we're inside the Telegram WebView
    // the Telegram login option is available and will use the existing session.
    try {
      login();
    } catch (err) {
      hasAttemptedLogin.current = false;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        'Telegram Mini App auto-login failed',
        { error: message },
        'TelegramMiniApp'
      );
      setError(message);
    }
  }, [isMiniApp, ready, authenticated, isLoading, login, telegramUser?.id]);

  // ── Back button ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isMiniApp || !sdkRef.current) return;
    const sdk = sdkRef.current;

    // Mount the back button component if available.
    if (sdk.backButton.mount.isAvailable()) sdk.backButton.mount();

    // Listen for back button clicks and trigger browser back navigation.
    const handler = () => {
      if (typeof window !== 'undefined') window.history.back();
    };

    if (sdk.backButton.onClick.isAvailable()) sdk.backButton.onClick(handler);

    // Show the back button when navigating away from the root.
    const updateVisibility = () => {
      if (typeof window === 'undefined') return;
      const isRoot =
        window.location.pathname === '/' || window.location.pathname === '';
      if (isRoot) {
        if (sdk.backButton.hide.isAvailable()) sdk.backButton.hide();
      } else {
        if (sdk.backButton.show.isAvailable()) sdk.backButton.show();
      }
    };

    updateVisibility();
    window.addEventListener('popstate', updateVisibility);

    return () => {
      window.removeEventListener('popstate', updateVisibility);
      if (sdk.backButton.offClick.isAvailable())
        sdk.backButton.offClick(handler);
      if (sdk.backButton.hide.isAvailable()) sdk.backButton.hide();
    };
  }, [isMiniApp]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const share = (url: string, text?: string) => {
    if (!isMiniApp || !sdkRef.current) return;
    const sdk = sdkRef.current;

    // Use Telegram's share URL scheme.
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
    if (sdk.openTelegramLink.isAvailable()) {
      sdk.openTelegramLink(shareUrl);
    } else if (typeof window !== 'undefined') {
      window.open(shareUrl, '_blank');
    }

    logger.info(
      'Telegram Mini App share opened',
      { url, text },
      'TelegramMiniApp'
    );
  };

  const close = () => {
    if (!isMiniApp || !sdkRef.current) return;
    const sdk = sdkRef.current;
    if (sdk.miniApp.close.isAvailable()) sdk.miniApp.close();
  };

  // ── Context ──────────────────────────────────────────────────────────────

  const value: TelegramMiniAppContextType = {
    isMiniApp,
    isLoading,
    error,
    user: telegramUser,
    share,
    close,
  };

  return (
    <TelegramMiniAppContext.Provider value={value}>
      {children}
    </TelegramMiniAppContext.Provider>
  );
}
