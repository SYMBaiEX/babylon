'use client';

import { cn, logger, WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { usePrivy } from '@privy-io/react-auth';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Address } from 'viem';
import { Skeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useBuyPointsTx } from '@/hooks/useBuyPointsTx';
import { useWalletFunding } from '@/hooks/useWalletFunding';
import { getAuthToken } from '@/lib/auth';
import { getExplorerTxUrl } from '@/lib/chain';
import { isStripeEnabled } from '@/lib/stripe';

/**
 * Buy points modal component for purchasing points with ETH or credit card.
 *
 * Provides a multi-step payment flow for buying points using either:
 * - ETH from smart wallet (crypto)
 * - Credit card via Stripe Checkout
 *
 * Features:
 * - Payment method selection (crypto vs card)
 * - USD amount input
 * - ETH conversion (for crypto)
 * - Smart wallet funding (if needed)
 * - Stripe Checkout redirect (for card)
 * - Payment processing
 * - Point award verification
 * - Multi-step flow (input → payment → verifying → success/error)
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 * - Cancellable async operations with AbortController
 *
 * @param props - BuyPointsModal component props
 * @returns Buy points modal element or null if not open
 *
 * @example
 * ```tsx
 * <BuyPointsModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   onSuccess={() => refreshBalance()}
 * />
 * ```
 */
interface BuyPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Payment step type for buy points flow.
 */
type PaymentStep = 'input' | 'payment' | 'verifying' | 'success' | 'error';

/**
 * Payment method type.
 */
type PaymentMethod = 'crypto' | 'stripe';

/**
 * Payment request structure for point purchase.
 */
interface PaymentRequest {
  requestId: string;
  to: string;
  from: string;
  amount: string;
}

export function BuyPointsModal({
  isOpen,
  onClose,
  onSuccess,
}: BuyPointsModalProps) {
  const { user, smartWalletAddress, smartWalletReady } = useAuth();
  const { getAccessToken } = usePrivy();
  const { sendPointsPayment } = useBuyPointsTx();
  const { ensureFunds } = useWalletFunding();

  const [amountUSD, setAmountUSD] = useState('10');
  const [step, setStep] = useState<PaymentStep>('input');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [walletInitializing, setWalletInitializing] = useState(false);

  // Check if Stripe is available
  const stripeAvailable = isStripeEnabled();

  // Determine available payment methods
  const canUseCrypto = !!smartWalletAddress;
  const canUseStripe = stripeAvailable;
  const hasAnyPaymentMethod = canUseCrypto || canUseStripe;

  // Track if user has manually selected a payment method
  const [userSelectedMethod, setUserSelectedMethod] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    // Default to Stripe if available and user has no wallet, otherwise crypto
    if (stripeAvailable && !smartWalletAddress) {
      return 'stripe';
    }
    return 'crypto';
  });

  // Handle user selecting a payment method
  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setUserSelectedMethod(true);
    setPaymentMethod(method);
  };

  // Only auto-switch if user hasn't manually selected AND no payment methods available
  // Don't auto-switch away from user's choice - let them see the "no wallet" message
  useEffect(() => {
    // Only auto-switch on initial mount if user hasn't made a selection
    if (!userSelectedMethod) {
      // If currently on crypto but no wallet, switch to stripe if available
      if (paymentMethod === 'crypto' && !canUseCrypto && canUseStripe) {
        setPaymentMethod('stripe');
      }
    }
  }, [canUseCrypto, canUseStripe, paymentMethod, userSelectedMethod]);

  // AbortController for canceling async operations
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ref to track smartWalletReady state for use in async callbacks (avoids stale closure)
  const smartWalletReadyRef = useRef(smartWalletReady);

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  // Keep ref updated when smartWalletReady changes
  useEffect(() => {
    smartWalletReadyRef.current = smartWalletReady;
  }, [smartWalletReady]);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Cancel any in-flight operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Reset state after animation completes
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          setAmountUSD('10');
          setStep('input');
          setLoading(false);
          setTxHash(null);
          setError(null);
          setPointsAwarded(0);
          setWalletInitializing(false);
          // Reset payment method selection - stripe preferred if available
          setPaymentMethod(stripeAvailable ? 'stripe' : 'crypto');
          setUserSelectedMethod(false);
        }
      }, 300);

      // Cleanup timeout if component unmounts or modal reopens
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isOpen, stripeAvailable]);

  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading && step === 'input') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, loading, step]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      // Cancel any in-flight operations on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const amountNum = Number.parseFloat(amountUSD) || 0;
  const pointsAmount = Math.floor(amountNum * 100);

  /**
   * Waits for the smart wallet to be ready with proper interval-based polling.
   * Uses refs to avoid stale closure issues and supports cancellation.
   */
  const waitForWalletReady = (signal: AbortSignal): Promise<boolean> => {
    return new Promise((resolve) => {
      // If already aborted, resolve immediately
      if (signal.aborted) {
        resolve(false);
        return;
      }

      // If already ready, resolve immediately
      if (smartWalletReadyRef.current) {
        resolve(true);
        return;
      }

      const maxWaitTime = 5000;
      const checkInterval = 100;
      const startTime = Date.now();

      const intervalId = setInterval(() => {
        // Check if cancelled
        if (signal.aborted) {
          clearInterval(intervalId);
          resolve(false);
          return;
        }

        // Check if wallet is ready
        if (smartWalletReadyRef.current) {
          clearInterval(intervalId);
          resolve(true);
          return;
        }

        // Check if timeout exceeded
        if (Date.now() - startTime >= maxWaitTime) {
          clearInterval(intervalId);
          resolve(false);
          return;
        }
      }, checkInterval);

      // Handle abort during wait
      signal.addEventListener(
        'abort',
        () => {
          clearInterval(intervalId);
          resolve(false);
        },
        { once: true }
      );
    });
  };

  /**
   * Handle Stripe Checkout - redirects to Stripe hosted checkout
   */
  const handleStripeCheckout = async () => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    if (amountNum < 1) {
      toast.error('Minimum purchase is $1');
      return;
    }

    if (amountNum > 1000) {
      toast.error('Maximum purchase is $1000');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();

      if (!token) {
        logger.error('Authentication required', undefined, 'BuyPointsModal');
        setError('Authentication required');
        setStep('error');
        toast.error('Please sign in to continue');
        return;
      }

      const response = await fetch('/api/stripe/checkout/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amountUSD: amountNum }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Failed to create checkout session';
        logger.error(
          'Failed to create Stripe checkout',
          { error: errorMessage },
          'BuyPointsModal'
        );
        setError(errorMessage);
        setStep('error');
        toast.error('Failed to start checkout');
        return;
      }

      // Redirect to Stripe Checkout
      // Points will be credited via webhook after successful payment
      window.location.href = data.url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      logger.error(
        'Stripe checkout failed',
        { error: errorMessage },
        'BuyPointsModal'
      );
      setError(errorMessage);
      setStep('error');
      toast.error('Failed to connect to payment server');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePayment = async () => {
    if (!user || !smartWalletAddress) {
      toast.error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      return;
    }

    if (amountNum < 1) {
      toast.error('Minimum purchase is $1');
      return;
    }

    if (amountNum > 1000) {
      toast.error('Maximum purchase is $1000');
      return;
    }

    // Create abort controller FIRST - before any async operations
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Check if smart wallet is ready, if not wait for initialization
    if (!smartWalletReady) {
      setWalletInitializing(true);
      toast.info('Initializing wallet...');

      const isReady = await waitForWalletReady(signal);

      // Check if cancelled during wait
      if (signal.aborted || !isMountedRef.current) {
        setWalletInitializing(false);
        return;
      }

      setWalletInitializing(false);

      if (!isReady) {
        toast.error(
          'Wallet is still initializing. Please try again in a moment.'
        );
        abortControllerRef.current = null;
        return;
      }

      toast.success('Wallet ready!');
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();

      // Check if cancelled after getting token
      if (signal.aborted || !isMountedRef.current) {
        setLoading(false);
        return;
      }

      if (!token) {
        logger.error('Authentication required', undefined, 'BuyPointsModal');
        setError('Authentication required');
        setStep('error');
        toast.error('Failed to create payment request');
        setLoading(false);
        abortControllerRef.current = null;
        return;
      }

      // Create payment request with abort signal
      const response = await fetch('/api/points/purchase/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amountUSD: amountNum,
          fromAddress: smartWalletAddress,
        }),
        signal,
      });

      // Check if cancelled after fetch
      if (signal.aborted || !isMountedRef.current) {
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Failed to create payment request';
        logger.error(
          'Failed to create payment',
          { error: errorMessage },
          'BuyPointsModal'
        );
        setError(errorMessage);
        setStep('error');
        toast.error('Failed to create payment request');
        setLoading(false);
        abortControllerRef.current = null;
        return;
      }

      setStep('payment');

      // Initiate blockchain transaction
      await handleSendPayment(data.paymentRequest, signal);
    } catch (err) {
      // Handle abort errors silently
      if (err instanceof Error && err.name === 'AbortError') {
        setLoading(false);
        return;
      }

      // Only propagate non-cancellation errors
      if (err instanceof Error && !err.message.includes('cancelled')) {
        const errorMessage = err.message || 'Payment failed';
        logger.error(
          'Payment failed',
          { error: errorMessage },
          'BuyPointsModal'
        );
        if (isMountedRef.current) {
          setError(errorMessage);
          setStep('error');
          toast.error('Payment transaction failed');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      // Clean up abort controller after operation completes
      abortControllerRef.current = null;
    }
  };

  const handleSendPayment = async (
    paymentRequest: PaymentRequest,
    signal: AbortSignal
  ) => {
    setLoading(true);
    setStep('payment');

    // Use ref for consistent check (avoids stale closure)
    if (!smartWalletReadyRef.current || !smartWalletAddress) {
      const errorMessage = WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET;
      logger.error('Payment failed', { error: errorMessage }, 'BuyPointsModal');
      setError(errorMessage);
      setStep('error');
      toast.error('Payment transaction failed');
      setLoading(false);
      return;
    }

    try {
      const requiredAmountWei = BigInt(paymentRequest.amount);

      // Use shared hook with abort signal
      await ensureFunds(smartWalletAddress, requiredAmountWei, { signal });

      // Check if operation was cancelled after funding
      if (signal.aborted || !isMountedRef.current) {
        setLoading(false);
        return;
      }

      const hash = await sendPointsPayment({
        to: paymentRequest.to as Address,
        amountWei: requiredAmountWei,
      });

      // Check if cancelled after payment
      if (signal.aborted || !isMountedRef.current) {
        setLoading(false);
        return;
      }

      setTxHash(hash);
      setStep('verifying');

      // Verify payment and credit points
      await handleVerifyPayment(
        paymentRequest.requestId,
        hash,
        paymentRequest,
        signal
      );
    } catch (err) {
      // Don't show error if operation was cancelled
      if (err instanceof Error && err.message === 'Operation cancelled') {
        setLoading(false);
        return;
      }
      throw err;
    }
  };

  const handleVerifyPayment = async (
    requestId: string,
    transactionHash: string,
    paymentRequest: PaymentRequest,
    signal: AbortSignal
  ) => {
    // Check if cancelled before starting
    if (signal.aborted || !isMountedRef.current) {
      setLoading(false);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      logger.error('Authentication required', undefined, 'BuyPointsModal');
      setError('Authentication required');
      setStep('error');
      toast.error('Failed to verify payment');
      setLoading(false);
      return;
    }

    // Wait a bit for transaction to be confirmed (with cancellation support)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      const abortHandler = () => {
        clearTimeout(timeout);
        resolve();
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    });

    // Check if cancelled after wait
    if (signal.aborted || !isMountedRef.current) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/points/purchase/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          txHash: transactionHash,
          fromAddress: paymentRequest.from,
          toAddress: paymentRequest.to,
          amount: paymentRequest.amount,
        }),
        signal,
      });

      // Check if cancelled after fetch
      if (signal.aborted || !isMountedRef.current) {
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Failed to verify payment';
        logger.error(
          'Payment verification failed',
          { error: errorMessage },
          'BuyPointsModal'
        );
        setError(errorMessage);
        setStep('error');
        toast.error('Failed to verify payment');
        setLoading(false);
        return;
      }

      setPointsAwarded(data.pointsAwarded);
      setStep('success');
      toast.success(`Successfully purchased ${data.pointsAwarded} points!`);

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess();
      }
      setLoading(false);
    } catch (err) {
      // Handle abort errors silently
      if (err instanceof Error && err.name === 'AbortError') {
        setLoading(false);
        return;
      }
      throw err;
    }
  };

  const handleClose = () => {
    if (loading || step === 'payment' || step === 'verifying') {
      return; // Prevent closing during payment
    }
    onClose();
  };

  const handleSubmit = () => {
    if (paymentMethod === 'stripe') {
      handleStripeCheckout();
    } else {
      handleCreatePayment();
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'input':
        return (
          <>
            <div className="space-y-4">
              {/* Payment Method Selector */}
              {stripeAvailable && (
                <div>
                  <label className="mb-2 block font-medium text-sm">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handlePaymentMethodChange('crypto')}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-lg border px-4 py-3 transition-colors',
                        paymentMethod === 'crypto'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-sidebar hover:border-primary/50'
                      )}
                      disabled={loading}
                    >
                      <Wallet className="h-4 w-4" />
                      <span className="font-medium text-sm">Crypto</span>
                    </button>
                    <button
                      onClick={() => handlePaymentMethodChange('stripe')}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-lg border px-4 py-3 transition-colors',
                        paymentMethod === 'stripe'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-sidebar hover:border-primary/50'
                      )}
                      disabled={loading}
                    >
                      <CreditCard className="h-4 w-4" />
                      <span className="font-medium text-sm">Card</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Amount Input */}
              <div>
                <label className="mb-2 block font-medium text-sm">
                  Amount (USD)
                </label>
                <div className="relative">
                  <DollarSign className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
                  <input
                    data-testid="points-amount-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={amountUSD}
                    onChange={(e) => {
                      // Only allow digits, filter out everything else
                      const sanitized = e.target.value.replace(/[^0-9]/g, '');
                      // Remove leading zeros (except for empty string)
                      const noLeadingZeros = sanitized.replace(/^0+/, '') || '';
                      // Clamp to max 1000
                      const num = parseInt(noLeadingZeros, 10);
                      if (noLeadingZeros === '' || isNaN(num)) {
                        setAmountUSD('');
                      } else if (num > 1000) {
                        setAmountUSD('1000');
                      } else {
                        setAmountUSD(noLeadingZeros);
                      }
                    }}
                    className="w-full rounded-lg border border-border bg-sidebar py-3 pr-4 pl-10 focus:border-border focus:outline-none"
                    placeholder="10"
                    disabled={loading}
                  />
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Min: $1 • Max: $1000
                </p>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmountUSD(amt.toString())}
                    className={cn(
                      'rounded-lg border px-4 py-2 transition-colors',
                      amountNum === amt
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-sidebar hover:border-primary'
                    )}
                    disabled={loading}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* Points Calculation */}
              <div className="rounded-2xl border border-border bg-sidebar p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    You'll receive:
                  </span>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-yellow-500" />
                    <span
                      data-testid="points-amount-display"
                      className="font-bold text-xl"
                    >
                      {pointsAmount.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      points
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-center text-muted-foreground text-xs">
                  100 points = $1 USD
                </div>
              </div>

              {/* Crypto selected but no wallet */}
              {paymentMethod === 'crypto' && !canUseCrypto && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="text-amber-700 text-xs dark:text-amber-300">
                      <p className="mb-1 font-medium">Wallet not connected</p>
                      <p>
                        {smartWalletReady
                          ? 'No wallet found. Please connect a wallet to pay with crypto.'
                          : 'Your wallet is still initializing. Please wait a moment or switch to card payment.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* No Payment Methods Warning */}
              {!hasAnyPaymentMethod && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div className="text-red-700 text-xs dark:text-red-300">
                      <p className="mb-1 font-medium">
                        No payment methods available
                      </p>
                      <p>
                        Your wallet is still initializing. Please wait a moment
                        and try again.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <div className="text-blue-700 text-xs dark:text-blue-300">
                    <p className="mb-1 font-medium">
                      Points are non-transferable
                    </p>
                    <p>
                      Points can be used for trading and rewards but cannot be
                      transferred to other users.
                    </p>
                  </div>
                </div>
              </div>

              {/* Stripe Info */}
              {paymentMethod === 'stripe' && (
                <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
                    <div className="text-purple-700 text-xs dark:text-purple-300">
                      <p className="mb-1 font-medium">
                        Secure checkout via Stripe
                      </p>
                      <p>
                        You'll be redirected to Stripe to complete your payment
                        securely. Points will be credited immediately.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border border-border bg-sidebar px-4 py-3 transition-colors hover:bg-accent"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                data-testid="buy-points-submit-button"
                onClick={handleSubmit}
                disabled={
                  loading ||
                  walletInitializing ||
                  amountNum < 1 ||
                  amountNum > 1000 ||
                  !user ||
                  !hasAnyPaymentMethod ||
                  (paymentMethod === 'crypto' && !canUseCrypto) ||
                  (paymentMethod === 'stripe' && !canUseStripe)
                }
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                {paymentMethod === 'stripe' ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                {walletInitializing
                  ? 'Initializing wallet...'
                  : loading
                    ? 'Processing...'
                    : `Buy ${pointsAmount.toLocaleString()} Points`}
              </button>
            </div>
          </>
        );

      case 'payment':
      case 'verifying':
        return (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <Skeleton className="h-16 w-16 rounded-full" />
            </div>
            <h3 className="mb-2 font-semibold text-lg">
              {step === 'payment'
                ? 'Processing Payment...'
                : 'Verifying Transaction...'}
            </h3>
            <p className="mb-4 text-muted-foreground text-sm">
              {step === 'payment'
                ? 'Preparing your payment transaction...'
                : 'Confirming your payment on the blockchain'}
            </p>
            {txHash && getExplorerTxUrl(txHash) && (
              <a
                data-testid="transaction-hash-link"
                href={getExplorerTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs hover:underline"
              >
                View transaction
              </a>
            )}
          </div>
        );

      case 'success':
        return (
          <div data-testid="payment-success" className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
            <h3 className="mb-2 font-semibold text-lg">Purchase Successful!</h3>
            <div className="mb-6 rounded-2xl border border-border bg-sidebar p-4">
              <div className="mb-2 flex items-center justify-center gap-2">
                <Sparkles className="h-6 w-6 text-yellow-500" />
                <span
                  data-testid="points-awarded-amount"
                  className="font-bold text-2xl"
                >
                  {pointsAwarded.toLocaleString()}
                </span>
                <span className="text-muted-foreground">points</span>
              </div>
              <p className="text-muted-foreground text-xs">
                added to your account
              </p>
            </div>
            {txHash && getExplorerTxUrl(txHash) && (
              <a
                href={getExplorerTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 inline-block text-primary text-xs hover:underline"
              >
                View transaction
              </a>
            )}
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-primary px-4 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        );

      case 'error':
        return (
          <div data-testid="payment-error" className="py-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h3 className="mb-2 font-semibold text-lg">Payment Failed</h3>
            <p
              data-testid="payment-error-message"
              className="mb-6 text-muted-foreground text-sm"
            >
              {error || 'An error occurred during payment'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border border-border bg-sidebar px-4 py-3 transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setStep('input');
                  setError(null);
                }}
                className="flex-1 rounded-lg bg-primary px-4 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try Again
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      data-testid="buy-points-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        data-testid="buy-points-modal"
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-border border-b p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            <h2 className="font-bold text-xl">Buy Points</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            disabled={loading || step === 'payment' || step === 'verifying'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">{renderContent()}</div>
      </div>
    </div>
  );
}
