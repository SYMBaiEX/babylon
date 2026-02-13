'use client';

import { useDiscordActivity } from '@/components/providers/DiscordActivityProvider';
import { useFarcasterMiniApp } from '@/components/providers/FarcasterMiniAppProvider';
import { useTelegramMiniApp } from '@/components/providers/TelegramMiniAppProvider';

type Platform = 'farcaster' | 'telegram' | 'discord' | 'web';

/**
 * Hook that returns the current platform the app is running on.
 *
 * Checks the mini-app / activity providers to determine if the app
 * is embedded in Farcaster, Telegram, Discord, or running as a
 * standalone web app.
 *
 * Must be used within the provider tree that includes all three
 * mini-app providers.
 *
 * @returns The current platform identifier and loading state
 */
export function usePlatform(): { platform: Platform; isLoading: boolean } {
  const farcaster = useFarcasterMiniApp();
  const telegram = useTelegramMiniApp();
  const discord = useDiscordActivity();

  const isLoading =
    farcaster.isLoading || telegram.isLoading || discord.isLoading;

  if (farcaster.isMiniApp) return { platform: 'farcaster', isLoading };
  if (telegram.isMiniApp) return { platform: 'telegram', isLoading };
  if (discord.isActivity) return { platform: 'discord', isLoading };

  return { platform: 'web', isLoading };
}
