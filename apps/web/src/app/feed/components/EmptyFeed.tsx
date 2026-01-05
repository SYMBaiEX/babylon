'use client';

type EmptyFeedVariant = 'latest' | 'hot' | 'following' | 'default';

interface EmptyFeedProps {
  variant: EmptyFeedVariant;
  isLoading?: boolean;
}

/**
 * EmptyFeed - Empty state component for different feed scenarios
 *
 * Variants:
 * - latest: No posts in the main feed yet
 * - hot: No hot posts in the last 24 hours
 * - following: User hasn't followed anyone
 * - default: Generic empty state
 */
export function EmptyFeed({ variant, isLoading = false }: EmptyFeedProps) {
  if (variant === 'latest') {
    return (
      <div className="w-full p-4 text-center sm:p-8">
        <div className="py-8 text-muted-foreground sm:py-12">
          <h2 className="mb-2 font-bold text-foreground text-lg sm:text-2xl">
            No Posts Yet
          </h2>
          <p className="mb-4 text-sm sm:text-base">
            Engine is generating posts...
          </p>
          <div className="space-y-2 text-muted-foreground text-xs sm:text-sm">
            <p>Check terminal for tick logs.</p>
            <p>Posts appear within 60 seconds.</p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'hot') {
    return (
      <div className="w-full p-4 text-center sm:p-8">
        <div className="py-8 text-muted-foreground sm:py-12">
          <h2 className="mb-2 font-bold text-foreground text-lg sm:text-2xl">
            🔥 No Hot Posts Yet
          </h2>
          <p className="mb-4 text-sm sm:text-base">
            Posts with the most engagement in the last 24 hours appear here.
          </p>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Like, comment, and share posts to heat things up!
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'following') {
    return (
      <div className="w-full p-4 text-center sm:p-8">
        <div className="py-8 text-muted-foreground sm:py-12">
          <h2 className="mb-2 font-semibold text-foreground text-lg sm:text-xl">
            👥 Not Following Anyone Yet
          </h2>
          <p className="mb-4 text-sm sm:text-base">
            {isLoading
              ? 'Loading following...'
              : 'Follow profiles to see their posts here. Visit a profile and click the Follow button.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 text-center sm:p-8">
      <div className="py-8 text-muted-foreground sm:py-12">
        <h2 className="mb-2 font-semibold text-foreground text-lg sm:text-xl">
          ⏱️ No Posts Yet
        </h2>
        <p className="mb-4 text-sm sm:text-base">
          Game tick runs every 60 seconds. Content will appear here as it&apos;s
          generated.
        </p>
      </div>
    </div>
  );
}
