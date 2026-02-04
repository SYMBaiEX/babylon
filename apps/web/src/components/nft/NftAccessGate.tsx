'use client';

import { isNftGatingAllowlistedPath } from '@babylon/shared';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { NftAccessResponse } from '@/types/nft';
import { apiFetch } from '@/utils/api-fetch';

function getWaitlistOrigin(): string {
  if (typeof window === 'undefined') return 'https://babylon.market';

  const fromEnv = process.env.NEXT_PUBLIC_WAITLIST_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  const hostname = window.location.hostname.toLowerCase();
  if (hostname.endsWith('staging.babylon.market')) {
    return 'https://staging.babylon.market';
  }
  if (hostname.endsWith('babylon.market')) {
    return 'https://babylon.market';
  }
  return window.location.origin;
}

function buildWaitlistRedirectUrl(
  pathname: string,
  searchParams: URLSearchParams
): string {
  const qs = searchParams.toString();
  const nextUrl = qs ? `${pathname}?${qs}` : pathname;
  const waitlistUrl = new URL('/', getWaitlistOrigin());
  if (nextUrl !== '/' && nextUrl !== '') {
    waitlistUrl.searchParams.set('next', nextUrl);
  }
  return waitlistUrl.toString();
}

function isNftAccessResponse(value: unknown): value is NftAccessResponse {
  if (typeof value !== 'object' || value === null) return false;
  if (
    !('success' in value) ||
    (value as { success: unknown }).success !== true
  ) {
    return false;
  }
  if (!('data' in value)) return false;
  const data = (value as { data: unknown }).data;
  if (typeof data !== 'object' || data === null) return false;
  return 'hasAccess' in data;
}
export function NftAccessGate({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ready, authenticated, loadingProfile, user } = useAuth();

  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!pathname) return;
    if (isNftGatingAllowlistedPath(pathname)) return;
    if (!ready) return;

    const targetUrl = buildWaitlistRedirectUrl(pathname, searchParams);

    if (!authenticated) {
      window.location.assign(targetUrl);
      return;
    }

    if (loadingProfile) return;
    if (user?.isAdmin) return;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    const run = async () => {
      try {
        const response = await apiFetch('/api/nft/access', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok || controller.signal.aborted) {
          window.location.assign(targetUrl);
          return;
        }

        const json = (await response.json()) as unknown;
        if (!isNftAccessResponse(json) || json.data.hasAccess !== true) {
          window.location.assign(targetUrl);
        }
      } catch {
        // Ignore abort errors from cleanup
        if (controller.signal.aborted) return;
        // On any other error, redirect to gate
        window.location.assign(targetUrl);
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [
    enabled,
    pathname,
    searchParams,
    ready,
    authenticated,
    loadingProfile,
    user?.isAdmin,
  ]);

  return null;
}
