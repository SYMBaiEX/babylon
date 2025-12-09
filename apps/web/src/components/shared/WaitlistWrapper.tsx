import { ComingSoon } from '@/components/shared/ComingSoon';

interface WaitlistWrapperProps {
  children: React.ReactNode;
  waitlistMode: boolean;
}

/**
 * Wrapper component that shows ComingSoon page when waitlist mode is enabled.
 *
 * @param children - Content to render when not in waitlist mode
 * @param waitlistMode - Whether waitlist mode is enabled (from NEXT_PUBLIC_WAITLIST_MODE)
 * @returns ComingSoon component or children based on waitlistMode
 */
export function WaitlistWrapper({
  children,
  waitlistMode,
}: WaitlistWrapperProps) {
  if (waitlistMode) {
    return <ComingSoon />;
  }

  return <>{children}</>;
}
