'use client';

import { isNftGatingAllowlistedPath } from '@babylon/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { EligibilityResponse } from '@/types/nft';
import { apiFetch } from '@/utils/api-fetch';

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error?: unknown };

function buildNftRedirectUrl(searchParams: URLSearchParams): string {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('gated', '1');
  const qs = nextParams.toString();
  return qs ? `/nft?${qs}` : '/nft';
}

export function NftAccessGate({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { ready, authenticated, loadingProfile, user } = useAuth();

  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!pathname) return;
    if (isNftGatingAllowlistedPath(pathname)) return;
    if (!ready) return;

    const targetUrl = buildNftRedirectUrl(searchParams);

    if (!authenticated) {
      router.replace(targetUrl);
      return;
    }

    if (loadingProfile) return;
    if (user?.isAdmin) return;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    const run = async () => {
      const response = await apiFetch('/api/nft/eligibility', {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok || controller.signal.aborted) {
        router.replace(targetUrl);
        return;
      }

      const json = (await response.json()) as ApiResponse<EligibilityResponse>;
      if (!('success' in json) || json.success !== true) {
        router.replace(targetUrl);
        return;
      }

      if (json.data.hasMinted !== true) {
        router.replace(targetUrl);
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
    router,
    ready,
    authenticated,
    loadingProfile,
    user?.isAdmin,
  ]);

  return null;
}
