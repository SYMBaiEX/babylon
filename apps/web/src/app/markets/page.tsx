'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageContainer } from '@/components/shared/PageContainer';
import { invalidateWalletBalance } from '@/stores/walletBalanceStore';
import { MarketsTradingTerminal } from './_components/terminal/MarketsTradingTerminal';

const BuyPointsModal = dynamic(
  () =>
    import('@/components/points/BuyPointsModal').then((m) => ({
      default: m.BuyPointsModal,
    })),
  { ssr: false }
);

/**
 * Markets page component.
 *
 * Unified trading terminal for all markets (perps + prediction markets).
 * Markets can be filtered within the terminal UI.
 */
export default function MarketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showBuyPointsModal, setShowBuyPointsModal] = useState(false);

  // Ref guard to prevent Stripe redirect effect from firing multiple times
  const stripeHandledRef = useRef(false);

  // Handle Stripe Checkout success/cancel redirects
  // When user returns from Stripe, show appropriate toast and clean URL
  useEffect(() => {
    // Prevent re-entry if already handled (can happen before router.replace completes)
    if (stripeHandledRef.current) return;

    const stripeSuccess = searchParams.get('stripe_success');
    const stripeCancelled = searchParams.get('stripe_cancelled');

    if (stripeSuccess === 'true') {
      stripeHandledRef.current = true;
      // Payment received - points are credited via webhook asynchronously
      // Message is conservative since webhook timing is not guaranteed
      const showToast = () => {
        toast.success(
          'Payment received! Your points will be credited shortly.',
          {
            duration: 5000,
            description: 'Your balance will update automatically.',
          }
        );
        invalidateWalletBalance();
      };
      // Small delay to allow webhook to complete (typically < 1 second)
      const timeout = setTimeout(showToast, 1000);

      // Clean up URL params after showing toast
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_success');
      url.searchParams.delete('session_id');
      router.replace(url.pathname + url.search, { scroll: false });

      return () => clearTimeout(timeout);
    } else if (stripeCancelled === 'true') {
      stripeHandledRef.current = true;
      // User cancelled checkout
      toast.info('Checkout cancelled. No payment was made.');
      invalidateWalletBalance();
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_cancelled');
      router.replace(url.pathname + url.search, { scroll: false });
    }
    return undefined;
  }, [searchParams, router]);

  return (
    <PageContainer
      noPadding
      className="flex h-[calc(100dvh-112px)] flex-col overflow-hidden md:h-dvh"
    >
      <div className="flex flex-1 overflow-hidden border-border bg-background/20 lg:border-l">
        <MarketsTradingTerminal
          onRequestBuyPoints={() => setShowBuyPointsModal(true)}
        />
      </div>

      {showBuyPointsModal && (
        <BuyPointsModal
          isOpen={showBuyPointsModal}
          onClose={() => setShowBuyPointsModal(false)}
          onSuccess={() => {
            invalidateWalletBalance();
          }}
        />
      )}
    </PageContainer>
  );
}
