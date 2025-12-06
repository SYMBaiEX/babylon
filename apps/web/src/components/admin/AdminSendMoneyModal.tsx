'use client';

import { CHAIN, cn, logger, WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useFundWallet, usePrivy } from '@privy-io/react-auth';
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Loader2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { useSmartWalletBalance } from '@/hooks/useSmartWalletBalance';

/**
 * Admin send money modal component for sending ETH to users.
 *
 * Provides a multi-step payment flow for admins to send ETH to users
 * via smart wallet transactions. Handles wallet funding, payment processing,
 * and transaction verification. Includes optional reason field for tracking.
 *
 * Features:
 * - USD amount input
 * - ETH conversion
 * - Optional reason field
 * - Smart wallet funding (if needed)
 * - Payment processing
 * - Transaction verification
 * - Multi-step flow (input → payment → verifying → success/error)
 * - Loading states
 * - Error handling
 * - Body scroll lock and escape key handling
 *
 * @param props - AdminSendMoneyModal component props
 * @returns Admin send money modal element or null if not open
 *
 * @example
 * ```tsx
 * <AdminSendMoneyModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   recipientId="user-123"
 *   recipientName="Alice"
 *   onSuccess={() => refreshData()}
 * />
 * ```
 */
interface AdminSendMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  recipientUsername?: string | null;
  recipientWalletAddress?: string | null;
  onSuccess?: () => void;
}

/**
 * Payment step type for admin send money flow.
 */
type PaymentStep = 'input' | 'payment' | 'verifying' | 'success' | 'error';

/**
 * Payment request structure for admin money transfer.
 */
interface PaymentRequest {
  requestId: string;
  to: string;
  from: string;
  amount: string;
}

export function AdminSendMoneyModal({
  isOpen,
  onClose,
  recipientId,
  recipientName,
  recipientUsername,
  recipientWalletAddress,
  onSuccess,
}: AdminSendMoneyModalProps) {
  const { getAccessToken } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { sendSmartWalletTransaction, smartWalletAddress, smartWalletReady } =
    useSmartWallet();
  const { balance, refreshBalance } = useSmartWalletBalance();

  const [amountUSD, setAmountUSD] = useState('10');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<PaymentStep>('input');
  const [loading, setLoading] = useState(false);
  const [escrowId, setEscrowId] = useState<string | null>(null);
  // paymentRequest is passed directly to handleSendPayment, no state needed
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureFunds = useCallback(
    async (requiredAmountWei: bigint) => {
      if (!smartWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
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
        address: smartWalletAddress as Address,
        options: {
          chain: CHAIN,
          amount: formatEther(deficit),
          asset: 'native-currency',
        },
      });

      // Poll for balance updates
      const maxAttempts = 30;
      const pollInterval = 1000;

      toast.info('Waiting for deposit to settle...');

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const updatedBalance = await refreshBalance();

        if (updatedBalance && updatedBalance >= requiredAmountWei) {
          toast.success('Funds received!');
          return true;
        }

        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      }

      toast.error('Deposit is taking longer than expected');
      throw new Error(
        'Funds are still settling. Please try again in a moment.'
      );
    },
    [balance, fundWallet, refreshBalance, smartWalletAddress]
  );

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setAmountUSD('10');
        setReason('');
        setStep('input');
        setLoading(false);
        setEscrowId(null);
        setTxHash(null);
        setError(null);
      }, 300);
    }
  }, [isOpen]);

  // Handle escape key
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

  if (!isOpen) return null;

  const amountNum = parseFloat(amountUSD) || 0;

  if (!recipientWalletAddress) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-border border-b p-6">
            <h2 className="font-bold text-xl">Send Money</h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 transition-colors hover:bg-muted/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-500">
                  Wallet Address Required
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {recipientName} needs to connect a wallet address before you
                  can send money.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg border border-border px-4 py-3 font-semibold transition-colors hover:bg-muted/50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleCreatePayment = async () => {
    if (!smartWalletAddress || !smartWalletReady) {
      toast.error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      return;
    }

    if (amountNum < 0.01) {
      toast.error('Minimum amount is $0.01');
      return;
    }

    if (amountNum > 10000) {
      toast.error('Maximum amount is $10,000');
      return;
    }

    setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      logger.error('Authentication required', undefined, 'AdminSendMoneyModal');
      setError('Authentication required');
      setStep('error');
      toast.error('Failed to create payment request');
      setLoading(false);
      return;
    }

    // Create escrow payment request
    const response = await fetch(
      '/api/admin/moderation-escrow/create-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientId,
          amountUSD: amountNum,
          reason: reason.trim() || undefined,
          recipientWalletAddress,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      const errorMessage = data.error || 'Failed to create payment request';
      logger.error(
        'Failed to create escrow payment',
        { error: errorMessage },
        'AdminSendMoneyModal'
      );
      setError(errorMessage);
      setStep('error');
      toast.error('Failed to create payment request');
      setLoading(false);
      return;
    }

    setEscrowId(data.escrow.id);
    const paymentReq = data.paymentRequest as PaymentRequest;
    setStep('payment');

    // Initiate blockchain transaction
    // Note: Admin sends payment from their wallet to treasury
    await handleSendPayment(paymentReq);
    setLoading(false);
  };

  const handleSendPayment = async (paymentReq: PaymentRequest) => {
    setLoading(true);
    setStep('payment');

    if (!smartWalletReady || !smartWalletAddress) {
      const errorMessage = WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET;
      logger.error(
        'Escrow payment failed',
        { error: errorMessage },
        'AdminSendMoneyModal'
      );
      setError(errorMessage);
      setStep('error');
      toast.error('Payment transaction failed');
      setLoading(false);
      return;
    }

    const requiredAmountWei = BigInt(paymentReq.amount);
    await ensureFunds(requiredAmountWei);

    const hash = await sendSmartWalletTransaction({
      to: paymentReq.to as Address,
      value: requiredAmountWei,
      chain: CHAIN,
    });

    setTxHash(hash);
    setStep('verifying');

    // Verify payment
    await handleVerifyPayment(hash, paymentReq);
  };

  const handleVerifyPayment = async (
    transactionHash: string,
    paymentReq: PaymentRequest
  ) => {
    const token = await getAccessToken();
    if (!token) {
      logger.error('Authentication required', undefined, 'AdminSendMoneyModal');
      setError('Authentication required');
      setStep('error');
      toast.error('Failed to verify payment');
      setLoading(false);
      return;
    }

    // Wait for transaction confirmation
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const response = await fetch(
      '/api/admin/moderation-escrow/verify-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          escrowId,
          txHash: transactionHash,
          fromAddress: smartWalletAddress || paymentReq.from,
          toAddress: paymentReq.to,
          amount: paymentReq.amount,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      const errorMessage = data.error || 'Failed to verify payment';
      logger.error(
        'Payment verification failed',
        { error: errorMessage },
        'AdminSendMoneyModal'
      );
      setError(errorMessage);
      setStep('error');
      toast.error('Failed to verify payment');
      setLoading(false);
      return;
    }

    setStep('success');
    toast.success(`Successfully sent $${amountNum} to ${recipientName}!`);

    if (onSuccess) {
      onSuccess();
    }
    setLoading(false);
  };

  const handleClose = () => {
    if (loading || step === 'payment' || step === 'verifying') {
      return;
    }
    onClose();
  };

  const renderContent = () => {
    switch (step) {
      case 'input':
        return (
          <>
            <div className="space-y-4">
              <div className="mb-4 rounded-lg bg-muted/50 p-3">
                <p className="text-muted-foreground text-sm">
                  Sending money to <strong>{recipientName}</strong>
                  {recipientUsername && ` (@${recipientUsername})`}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Wallet: {recipientWalletAddress?.slice(0, 6)}...
                  {recipientWalletAddress?.slice(-4)}
                </p>
              </div>

              <div>
                <label className="mb-2 block font-medium text-sm">
                  Amount (USD)
                </label>
                <div className="relative">
                  <DollarSign className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
                  <input
                    type="number"
                    min="0.01"
                    max="10000"
                    step="0.01"
                    value={amountUSD}
                    onChange={(e) => setAmountUSD(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-3 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="10.00"
                    disabled={loading}
                  />
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Min: $0.01 • Max: $10,000
                </p>
              </div>

              <div>
                <label className="mb-2 block font-medium text-sm">
                  Reason (optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you sending this payment? (compensation, refund, etc.)"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  maxLength={500}
                  disabled={loading}
                />
                <div className="mt-1 text-right text-muted-foreground text-xs">
                  {reason.length}/500
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-300 bg-red-100 p-3 dark:border-red-800 dark:bg-red-900/20">
                  <p className="text-red-800 text-sm dark:text-red-400">
                    {error}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 rounded-lg border border-border px-4 py-3 font-semibold transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePayment}
                disabled={loading || !amountUSD || amountNum < 0.01}
                className={cn(
                  'flex-1 rounded-lg px-4 py-3 font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'flex items-center justify-center gap-2'
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    Create Payment
                  </>
                )}
              </button>
            </div>
          </>
        );

      case 'payment':
        return (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <p className="mb-2 font-semibold text-lg">Sending Payment</p>
            <p className="text-muted-foreground text-sm">
              Please confirm the transaction in your wallet
            </p>
          </div>
        );

      case 'verifying':
        return (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <p className="mb-2 font-semibold text-lg">Verifying Payment</p>
            <p className="text-muted-foreground text-sm">
              Confirming your payment on the blockchain...
            </p>
            {txHash && (
              <p className="mt-2 font-mono text-muted-foreground text-xs">
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </p>
            )}
          </div>
        );

      case 'success':
        return (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="mb-2 font-semibold text-lg">Payment Sent!</p>
            <p className="text-muted-foreground text-sm">
              ${amountNum} sent to {recipientName}
            </p>
            {txHash && (
              <p className="mt-2 font-mono text-muted-foreground text-xs">
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </p>
            )}
            <button
              onClick={handleClose}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="mb-2 font-semibold text-lg text-red-600">
              Payment Failed
            </p>
            <p className="mb-4 text-muted-foreground text-sm">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('input');
                  setError(null);
                }}
                className="flex-1 rounded-lg border border-border px-4 py-3 font-semibold transition-colors hover:bg-muted/50"
              >
                Try Again
              </button>
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg bg-muted px-4 py-3 font-semibold transition-colors hover:bg-muted/80"
              >
                Close
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-border border-b p-6">
          <h2 className="font-bold text-xl">Send Money (Escrow)</h2>
          <button
            onClick={handleClose}
            disabled={loading || step === 'payment' || step === 'verifying'}
            className="rounded-full p-2 transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{renderContent()}</div>
      </div>
    </div>
  );
}
