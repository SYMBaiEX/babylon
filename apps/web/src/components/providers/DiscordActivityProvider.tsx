'use client';

import { logger } from '@babylon/shared';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

/**
 * Consolidated Discord Activity Provider.
 *
 * Handles:
 * 1. Activity detection (running inside Discord iframe)
 * 2. SDK initialization (ready → authorize → authenticate)
 * 3. URL mapping patches for Discord's proxy
 * 4. Discord user identity
 *
 * Works seamlessly in both Discord Activity and standalone modes.
 * The SDK is loaded dynamically to avoid import-time side-effects
 * outside Discord.
 */

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  globalName?: string;
  avatar?: string;
}

interface DiscordActivityContextType {
  isActivity: boolean;
  isLoading: boolean;
  error?: string;
  user: DiscordUser | null;
  /** The authenticated Discord access token (if available). */
  accessToken: string | null;
}

const DiscordActivityContext = createContext<DiscordActivityContextType | null>(
  null
);

/**
 * Hook to access Discord Activity context.
 *
 * Must be used within DiscordActivityProvider.
 *
 * @returns Discord Activity context
 * @throws Error if used outside DiscordActivityProvider
 */
export function useDiscordActivity() {
  const context = useContext(DiscordActivityContext);
  if (!context)
    throw new Error(
      'useDiscordActivity must be used within DiscordActivityProvider'
    );
  return context;
}

/**
 * Discord Activity provider component.
 *
 * Detects if the app is running inside a Discord Activity iframe, initialises
 * the Embedded App SDK, completes the OAuth flow, patches URL mappings for the
 * Discord proxy, and exposes the authenticated user.
 *
 * When running outside Discord the provider is a transparent pass-through.
 */
export function DiscordActivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isActivity, setIsActivity] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const hasInitialized = useRef(false);

  // ── Detect & Initialize ──────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const clientId = process.env.NEXT_PUBLIC_DISCORD_ACTIVITY_CLIENT_ID;

    // Early exit — if no client ID is configured, skip entirely.
    if (!clientId) {
      logger.debug(
        'Discord Activity not configured (NEXT_PUBLIC_DISCORD_ACTIVITY_CLIENT_ID missing)',
        {},
        'DiscordActivity'
      );
      setIsLoading(false);
      return;
    }

    // Discord Activities run inside an iframe on *.discordsays.com.
    // Quick heuristic: check if we're in an iframe and the referrer or
    // parent origin hints at Discord.  The SDK itself will throw if we're
    // not actually in an Activity, so this is just a fast bailout.
    const isLikelyDiscord =
      window.self !== window.top || // embedded in iframe
      window.location.hostname.endsWith('.discordsays.com');

    if (!isLikelyDiscord) {
      logger.debug('Not in Discord Activity context', {}, 'DiscordActivity');
      setIsLoading(false);
      return;
    }

    const initialize = async () => {
      try {
        // Dynamic import to avoid loading the SDK in non-Discord contexts.
        const { DiscordSDK, patchUrlMappings } = await import(
          '@discord/embedded-app-sdk'
        );

        const discordSdk = new DiscordSDK(clientId);

        // Step 1: Wait for the READY payload from Discord client.
        await discordSdk.ready();

        logger.info(
          'Discord Activity SDK ready',
          { instanceId: discordSdk.instanceId },
          'DiscordActivity'
        );

        // Step 2: Patch URL mappings for the Discord proxy.
        // These mappings must match what's configured in the Discord Developer
        // Portal under your app → URL Mappings.  The proxy rewrites all
        // outgoing network requests from the iframe.
        //
        // Only apply in production — in development the app runs locally
        // and doesn't need the proxy patches.
        //
        // Example mappings (configure in Developer Portal):
        //   /api  → play.babylon.market
        //   /blob → *.public.blob.vercel-storage.com
        if (process.env.NODE_ENV === 'production') {
          patchUrlMappings([{ prefix: '/api', target: 'play.babylon.market' }]);
        }

        // Step 3: Authorize — opens the OAuth permission modal inside Discord.
        const { code } = await discordSdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify'],
        });

        // Step 4: Exchange the code for an access token on our server.
        const tokenRes = await fetch('/.proxy/api/auth/discord/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          throw new Error(
            `Token exchange failed with status ${tokenRes.status}`
          );
        }

        const { access_token } = (await tokenRes.json()) as {
          access_token: string;
        };

        // Step 5: Authenticate with Discord using the access token.
        const auth = await discordSdk.commands.authenticate({ access_token });

        if (!auth) throw new Error('Discord authentication returned null');

        setAccessToken(access_token);
        setIsActivity(true);

        // Extract user identity from the auth response.
        if (auth.user) {
          setDiscordUser({
            id: auth.user.id,
            username: auth.user.username,
            discriminator: auth.user.discriminator,
            globalName: (auth.user as Record<string, unknown>).global_name as
              | string
              | undefined,
            avatar: auth.user.avatar ?? undefined,
          });
        }

        logger.info(
          'Discord Activity authenticated',
          {
            userId: auth.user?.id,
            username: auth.user?.username,
          },
          'DiscordActivity'
        );
      } catch (err) {
        // If the SDK throws because we're not actually in a Discord Activity,
        // treat it as a non-Activity context (not an error to surface).
        const message = err instanceof Error ? err.message : String(err);
        const isNotAnActivity =
          message.includes('not running in Discord') ||
          message.includes('READY') ||
          message.includes('postMessage');

        if (isNotAnActivity) {
          logger.debug(
            'Not in Discord Activity context (SDK detection)',
            { reason: message },
            'DiscordActivity'
          );
        } else {
          logger.error(
            'Discord Activity initialization failed',
            { error: message },
            'DiscordActivity'
          );
          setError(message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  // ── Context ──────────────────────────────────────────────────────────────

  const value: DiscordActivityContextType = {
    isActivity,
    isLoading,
    error,
    user: discordUser,
    accessToken,
  };

  return (
    <DiscordActivityContext.Provider value={value}>
      {children}
    </DiscordActivityContext.Provider>
  );
}
