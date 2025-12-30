'use client';

import { CHAIN, cn, logger, WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useFundWallet, usePrivy } from '@privy-io/react-auth';
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { Skeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useBuyPointsTx } from '@/hooks/useBuyPointsTx';
import { useSmartWalletBalance } from '@/hooks/useSmartWalletBalance';
import { getAuthToken } from '@/lib/auth';

/**
 * Buy points modal component for purchasing points with ETH.
 *
 * Provides a multi-step payment flow for buying points using ETH from
 * smart wallet. Handles wallet funding, payment processing, and point
 * award verification. Includes balance checking and automatic wallet
 * funding if needed.
 *
 * Features:
 * - USD amount input
 * - ETH conversion
 * - Smart wallet funding (if needed)
 * - Payment processing
 * - Point award verification
 * - Multi-step flow (input → payment → verifying → success/error)
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
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
  const { fundWallet } = useFundWallet();
  const { sendPointsPayment } = useBuyPointsTx();
  const { balance, refreshBalance } = useSmartWalletBalance();

  const [amountUSD, setAmountUSD] = useState('10');
  const [step, setStep] = useState<PaymentStep>('input');
  const [loading, setLoading] = useState(false);
  const [_paymentRequestId, setPaymentRequestId] = useState<string | null>(
    null
  );
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [walletInitializing, setWalletInitializing] = useState(false);

  // AbortController for canceling async operations
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ref to track smartWalletReady state for use in while loop (avoids stale closure)
  const smartWalletReadyRef = useRef(smartWalletReady);

  // Keep ref updated when smartWalletReady changes
  useEffect(() => {
    smartWalletReadyRef.current = smartWalletReady;
  }, [smartWalletReady]);

  const ensureFunds = useCallback(
    async (requiredAmountWei: bigint, signal?: AbortSignal) => {
      if (!smartWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }

      // Check if operation was cancelled
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      const currentBalance = balance ?? (await refreshBalance());
      if (currentBalance !== null && currentBalance >= requiredAmountWei) {
        return true;
      }

      const deficit =
        requiredAmountWei - (currentBalance ?? 0n) > 0n
          ? requiredAmountWei - (currentBalance ?? 0n)
          : requiredAmountWei;

      await fundWallet({
        address: smartWalletAddress,
        options: {
          chain: CHAIN,
          amount: formatEther(deficit),
          asset: 'native-currency',
        },
      });

      // Poll for balance updates with timeout (30 seconds)
      const maxAttempts = 30;
      const pollInterval = 1000; // 1 second

      // Show feedback to user
      toast.info('Waiting for deposit to settle...');

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Check if operation was cancelled before each poll
        if (signal?.aborted) {
          toast.dismiss();
          throw new Error('Operation cancelled');
        }

        const updatedBalance = await refreshBalance();

        if (updatedBalance && updatedBalance >= requiredAmountWei) {
          toast.success('Funds received!');
          return true;
        }

        // Wait before next check (except on last attempt)
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => {
            const timeout = setTimeout(resolve, pollInterval);
            // Cancel timeout if operation is aborted
            signal?.addEventListener('abort', () => clearTimeout(timeout), { once: true });
          });
        }
      }

      // If we get here, funds didn't arrive in time
      toast.error('Deposit is taking longer than expected');
      throw new Error(
        'Funds are still settling. Please try again in a moment once the deposit arrives.'
      );
    },
    [balance, fundWallet, refreshBalance, smartWalletAddress]
  );

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
        setAmountUSD('10');
        setStep('input');
        setLoading(false);
        setPaymentRequestId(null);
        setTxHash(null);
        setError(null);
        setPointsAwarded(0);
        setWalletInitializing(false);
      }, 300);

      // Cleanup timeout if component unmounts or modal reopens
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isOpen]);

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
    };
  }, []);

  if (!isOpen) return null;

  const amountNum = Number.parseFloat(amountUSD) || 0;
  const pointsAmount = Math.floor(amountNum * 100);

  const handleCreatePayment = async () => {
    if (!user || !smartWalletAddress) {
      toast.error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      return;
    }

    // Check if smart wallet is ready, if not wait for initialization
    if (!smartWalletReady) {
      setWalletInitializing(true);
      toast.info('Initializing wallet...');

      // Wait up to 5 seconds for smart wallet to be ready
      const maxWaitTime = 5000;
      const checkInterval = 100;
      const startTime = Date.now();

      while (!smartWalletReadyRef.current && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      setWalletInitializing(false);

      if (!smartWalletReadyRef.current) {
        toast.error(
          'Wallet is still initializing. Please try again in a moment.'
        );
        return;
      }

      toast.success('Wallet ready!');
    }

    if (amountNum < 1) {
      toast.error('Minimum purchase is $1');
      return;
    }

    if (amountNum > 1000) {
      toast.error('Maximum purchase is $1000');
      return;
    }

    // Create new abort controller for this operation
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      logger.error('Authentication required', undefined, 'BuyPointsModal');
      setError('Authentication required');
      setStep('error');
      toast.error('Failed to create payment request');
      setLoading(false);
      return;
    }

    // Create payment request
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
    });

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
      return;
    }

    setPaymentRequestId(data.paymentRequest.requestId);
    setStep('payment');

    // Initiate blockchain transaction
    await handleSendPayment(data.paymentRequest);
    setLoading(false);
  };

  const handleSendPayment = async (paymentRequest: PaymentRequest) => {
    setLoading(true);
    setStep('payment');

    if (!smartWalletReady || !smartWalletAddress) {
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
      await ensureFunds(requiredAmountWei, abortControllerRef.current?.signal);

      // Check if operation was cancelled after funding
      if (abortControllerRef.current?.signal.aborted) {
        setLoading(false);
        return;
      }

      const hash = await sendPointsPayment({
        to: paymentRequest.to as Address,
        amountWei: requiredAmountWei,
      });

      setTxHash(hash);
      setStep('verifying');

      // Verify payment and credit points
      await handleVerifyPayment(paymentRequest.requestId, hash, paymentRequest);
    } catch (error) {
      // Don't show error if operation was cancelled
      if (error instanceof Error && error.message === 'Operation cancelled') {
        setLoading(false);
        return;
      }
      throw error;
    }
  };

  const handleVerifyPayment = async (
    requestId: string,
    transactionHash: string,
    paymentRequest: PaymentRequest
  ) => {
    const token = getAuthToken();
    if (!token) {
      logger.error('Authentication required', undefined, 'BuyPointsModal');
      setError('Authentication required');
      setStep('error');
      toast.error('Failed to verify payment');
      setLoading(false);
      return;
    }

    // Wait a bit for transaction to be confirmed
    await new Promise((resolve) => setTimeout(resolve, 3000));

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
    });

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
  };

  const handleClose = () => {
    if (loading || step === 'payment' || step === 'verifying') {
      return; // Prevent closing during payment
    }
    onClose();
  };

  const renderContent = () => {
    switch (step) {
      case 'input':
        return (
          <>
            <div className="space-y-4">
              {/* Amount Input */}
              <div>
                <label className="mb-2 block font-medium text-sm">
                  Amount (USD)
                </label>
                <div className="relative">
                  <DollarSign className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
                  <input
                    data-testid="points-amount-input"
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={amountUSD}
                    onChange={(e) => setAmountUSD(e.target.value)}
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
                onClick={handleCreatePayment}
                disabled={
                  loading ||
                  walletInitializing ||
                  amountNum < 1 ||
                  amountNum > 1000
                }
                className={cn(
                  'flex-1 rounded-lg px-4 py-3 font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                {walletInitializing
                  ? 'Initializing wallet...'
                  : loading
                    ? 'Processing...'
                    : `Buy ${pointsAmount} Points`}
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
            {txHash && (
              <a
                data-testid="transaction-hash-link"
                href={`https://sepolia.basescan.org/tx/${txHash}`}
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
            {txHash && (
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
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
