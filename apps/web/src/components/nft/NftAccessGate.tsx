'use client';

import { isNftGatingAllowlistedPath } from '@babylon/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { EligibilityApiResponse } from '@/types/nft';
import { apiFetch } from '@/utils/api-fetch';

function buildNftRedirectUrl(searchParams: URLSearchParams): string {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('gated', '1');
  const qs = nextParams.toString();
  return qs ? `/nft?${qs}` : '/nft';
}

function isEligibilityApiResponse(
  value: unknown
): value is EligibilityApiResponse {
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
  return 'hasMinted' in data;
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
      try {
        const response = await apiFetch('/api/nft/eligibility', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok || controller.signal.aborted) {
          router.replace(targetUrl);
          return;
        }

        const json = (await response.json()) as unknown;
        if (!isEligibilityApiResponse(json) || json.data.hasMinted !== true) {
          router.replace(targetUrl);
        }
      } catch {
        // Ignore abort errors from cleanup
        if (controller.signal.aborted) return;
        // On any other error, redirect to gate
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
