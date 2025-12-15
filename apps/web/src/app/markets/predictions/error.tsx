'use client';

/**
 * Error boundary for the predictions market page.
 * Catches chart rendering errors and provides recovery UI.
 */

import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PredictionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setTag('errorBoundary', 'predictions');
      scope.setTag('page', 'markets/predictions');
      if (error.digest) {
        scope.setTag('errorDigest', error.digest);
      }
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-orange-500" />
        <h2 className="mb-2 font-bold text-2xl">Chart Loading Error</h2>
        <p className="mb-6 text-muted-foreground">
          There was an issue loading the prediction markets. This may be due to
          a temporary connection issue.
        </p>
        {error.digest && (
          <p className="mb-4 text-muted-foreground text-xs">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-4">
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <button
            onClick={() => router.push('/markets')}
            className="rounded-md bg-secondary px-6 py-2 text-secondary-foreground transition-colors hover:bg-secondary/90"
          >
            Back to Markets
          </button>
        </div>
      </div>
    </div>
  );
}
