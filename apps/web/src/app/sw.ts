/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // skipWaiting + clientsClaim: the new service worker activates immediately
  // and takes control of all open tabs without waiting for them to close.
  //
  // This is intentional and safe for Babylon because:
  // 1. Real-time data (prices, predictions, events) comes from SSE/WebSocket
  //    streams and API calls, NOT from the service worker cache.
  // 2. The SW cache only holds static assets (JS/CSS bundles, images) and
  //    the offline fallback page — stale static assets are replaced atomically
  //    by the precache manifest, and Next.js uses content-hashed filenames so
  //    old and new assets never collide.
  // 3. Delaying activation would leave users on stale app shells indefinitely
  //    (tabs stay open for hours in prediction markets), which is worse than
  //    the theoretical race of an old page requesting a new asset.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
