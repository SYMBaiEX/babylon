'use client';

import type { StewardSession } from '@stwd/sdk';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { FeedStewardAuth } from '@/lib/auth/feed-steward-auth';

// ── Singleton StewardAuth instance ───────────────────────────────────────────

const STEWARD_TENANT_ID = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID ?? 'feed';

let _stewardAuthInstance: FeedStewardAuth | null = null;

function getOrCreateStewardAuth(): FeedStewardAuth {
  if (_stewardAuthInstance) return _stewardAuthInstance;
  const baseUrl =
    process.env.NEXT_PUBLIC_STEWARD_API_URL ??
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? 'https://auth.elizacloud.ai'
      : 'http://localhost:3200');
  _stewardAuthInstance = new FeedStewardAuth({
    baseUrl,
    tenantId: STEWARD_TENANT_ID,
    // Persist session across page reloads
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
  });
  return _stewardAuthInstance;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface StewardAuthContextValue {
  stewardAuth: FeedStewardAuth;
  session: StewardSession | null;
  isLoading: boolean;
  /** Call after a successful login to sync the httpOnly cookie and fetch the user profile. */
  onLoginSuccess: (
    token: string,
    refreshToken?: string | null
  ) => Promise<void>;
}

let cookieUpdates: Promise<void> = Promise.resolve();
function syncSessionCookie(token: string | null, refreshToken?: string | null) {
  const update = async () => {
    const res = await fetch('/api/auth/session', {
      method: token ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: token ? JSON.stringify({ token, refreshToken }) : undefined,
    });
    if (!res.ok) throw new Error(`Session cookie sync failed: ${res.status}`);
  };
  // Preserve update order across SDK refresh, callback completion, and logout.
  const result = cookieUpdates.then(update, update);
  cookieUpdates = result;
  return result;
}

const StewardAuthContext = createContext<StewardAuthContextValue | null>(null);

export function useStewardAuthContext(): StewardAuthContextValue {
  const ctx = useContext(StewardAuthContext);
  if (!ctx) {
    throw new Error(
      'useStewardAuthContext must be used inside StewardAuthProvider'
    );
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function StewardAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const stewardAuth = useRef(getOrCreateStewardAuth()).current;
  const [session, setSession] = useState<StewardSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const synchronize = async (next: StewardSession | null) => {
      if (!next) {
        if (active) {
          setSession(null);
          setIsLoading(false);
        }
        await syncSessionCookie(null).catch(() => undefined);
        return;
      }
      try {
        await syncSessionCookie(next.token, stewardAuth.getRefreshToken());
        if (active && stewardAuth.getSession()?.token === next.token) {
          setSession(next);
        }
      } catch {
        if (active && stewardAuth.getSession()?.token === next.token) {
          stewardAuth.signOut();
          setSession(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    const unsubscribe = stewardAuth.onSessionChange((next) => {
      void synchronize(next);
    });
    const checkRefresh = () => {
      if (!active || document.visibilityState === 'hidden') return;
      const current = stewardAuth.getSession();
      if (!current) setSession(null);
      if (!stewardAuth.getRefreshToken()) return;
      if (!current || stewardAuth.isNearExpiry()) {
        void stewardAuth.refreshSession();
      }
    };
    const timer = window.setInterval(checkRefresh, 30_000);
    window.addEventListener('focus', checkRefresh);
    document.addEventListener('visibilitychange', checkRefresh);
    checkRefresh();
    const restored = stewardAuth.getSession();
    if (restored) void synchronize(restored);
    else setIsLoading(false);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', checkRefresh);
      document.removeEventListener('visibilitychange', checkRefresh);
      unsubscribe();
    };
  }, [stewardAuth]);

  useEffect(() => {
    (
      window as Window & { __privyAccessToken?: string | null }
    ).__privyAccessToken = session?.token ?? null;
  }, [session]);

  const onLoginSuccess = useCallback(
    async (token: string, refreshToken?: string | null) => {
      const revision = stewardAuth.cancelPendingRefresh();
      setIsLoading(true);
      try {
        // Sync the token to the server-side httpOnly cookie before publishing a
        // local authenticated state. If this fails, clear any SDK-stored token so
        // callers do not redirect into an apparently authenticated UI without
        // httpOnly cookies.
        await syncSessionCookie(token, refreshToken);

        if (revision !== stewardAuth.sessionRevision) {
          throw new Error('Login was superseded by another session change');
        }
        setSession(stewardAuth.acceptSession(token, refreshToken));
      } catch (err) {
        if (revision === stewardAuth.sessionRevision) {
          stewardAuth.signOut();
          setSession(null);
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [stewardAuth]
  );

  return (
    <StewardAuthContext.Provider
      value={{ stewardAuth, session, isLoading, onLoginSuccess }}
    >
      {children}
    </StewardAuthContext.Provider>
  );
}
