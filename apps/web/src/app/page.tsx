import { ComingSoon } from '@/components/shared/ComingSoon';

// Homepage is a server component - no client JS needed
// Redirect to /feed is handled by middleware for non-waitlist mode
// This page only renders when WAITLIST_MODE=true

// Check waitlist mode using same logic as middleware for consistency
const waitlistFlag =
  process.env.WAITLIST_MODE ?? process.env.NEXT_PUBLIC_WAITLIST_MODE ?? '';
const waitlistModeEnabled = ['true', '1', 'yes', 'on'].includes(
  waitlistFlag.toLowerCase()
);

export default function HomePage() {
  // In normal mode, middleware redirects to /feed before this renders
  // This page only shows in waitlist mode
  if (!waitlistModeEnabled) {
    // Fallback for edge cases where middleware doesn't redirect
    // (e.g., direct server-side rendering during build)
    return null;
  }

  return <ComingSoon />;
}
