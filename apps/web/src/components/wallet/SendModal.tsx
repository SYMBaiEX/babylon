'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import { sendTokenAction } from '@/app/_actions/wallet';
import type { NativeBalance, TokenBalance } from '@/stores/onchainWalletStore';

type SendStep = 'form' | 'review' | 'sending' | 'success' | 'error';

interface SendableAsset {
  type: 'native' | 'erc20';
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  address?: string;
  logoUrl?: string;
}

interface SendModalProps {
  open: boolean;
  onClose: () => void;
  nativeBalance: NativeBalance | null;
  tokens: TokenBalance[];
  senderAddress: string;
  onSuccess?: () => void;
}

export function SendModal({
  open,
  onClose,
  nativeBalance,
  tokens,
  senderAddress,
  onSuccess,
}: SendModalProps) {
  const { getAccessToken } = usePrivy();
  const [step, setStep] = useState<SendStep>('form');
  const [selectedAsset, setSelectedAsset] = useState<SendableAsset | null>(
    null
  );
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txResult, setTxResult] = useState<{
    txHash: string;
    explorerUrl: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const resetAndClose = useCallback(() => {
    setStep('form');
    setSelectedAsset(null);
    setRecipient('');
    setAmount('');
    setTxResult(null);
    setErrorMessage('');
    onClose();
  }, [onClose]);

  // Build asset list from balances
  const assets: SendableAsset[] = [];
  if (nativeBalance) {
    assets.push({
      type: 'native',
      symbol: nativeBalance.symbol,
      name: 'Ethereum',
      decimals: nativeBalance.decimals,
      balance: nativeBalance.balance,
    });
  }
  for (const token of tokens) {
    if (token.balance !== '0') {
      assets.push({
        type: 'erc20',
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        balance: token.balance,
        address: token.address,
        logoUrl: token.logoUrl,
      });
    }
  }

  const formatBalance = (raw: string, decimals: number): string => {
    if (raw === '0') return '0';
    const val = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);
    const whole = val / divisor;
    const remainder = val % divisor;
    if (remainder === 0n) return whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, '0');
    const trimmed = remainderStr.slice(0, 6).replace(/0+$/, '');
    return trimmed ? `${whole}.${trimmed}` : whole.toString();
  };

  const validateForm = (): string | null => {
    if (!selectedAsset) return 'Please select an asset';
    if (!recipient.trim()) return 'Please enter a recipient address';
    if (!isAddress(recipient.trim())) return 'Invalid Ethereum address';
    if (recipient.trim().toLowerCase() === senderAddress.toLowerCase())
      return 'Cannot send to your own address';
    if (!amount.trim()) return 'Please enter an amount';
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) return 'Invalid amount';

    // Check if amount exceeds balance
    const maxFormatted = formatBalance(
      selectedAsset.balance,
      selectedAsset.decimals
    );
    if (numAmount > Number(maxFormatted)) return 'Insufficient balance';

    return null;
  };

  const handleReview = () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }
    setStep('review');
  };

  const handleSend = async () => {
    if (!selectedAsset) return;
    setStep('sending');

    const jwt = await getAccessToken();

    try {
      const result = await sendTokenAction({
        recipientAddress: recipient.trim(),
        amount: amount.trim(),
        tokenAddress: selectedAsset.address,
        userJwt: jwt ?? undefined,
      });

      setTxResult(result);
      setStep('success');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      setErrorMessage(message);
      setStep('error');
    }
  };

  const handleSetMax = () => {
    if (!selectedAsset) return;
    setAmount(formatBalance(selectedAsset.balance, selectedAsset.decimals));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
        <button
          onClick={resetAndClose}
          className="absolute top-4 right-4 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {step === 'form' && (
          <FormStep
            assets={assets}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            recipient={recipient}
            onRecipientChange={setRecipient}
            amount={amount}
            onAmountChange={setAmount}
            onSetMax={handleSetMax}
            onReview={handleReview}
            formatBalance={formatBalance}
          />
        )}

        {step === 'review' && selectedAsset && (
          <ReviewStep
            asset={selectedAsset}
            recipient={recipient}
            amount={amount}
            senderAddress={senderAddress}
            onBack={() => setStep('form')}
            onConfirm={handleSend}
          />
        )}

        {step === 'sending' && <SendingStep />}

        {step === 'success' && txResult && (
          <SuccessStep
            txHash={txResult.txHash}
            explorerUrl={txResult.explorerUrl}
            onClose={resetAndClose}
          />
        )}

        {step === 'error' && (
          <ErrorStep
            message={errorMessage}
            onRetry={() => setStep('review')}
            onClose={resetAndClose}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step Components ─────────────────────────────────────────────────────────

function FormStep({
  assets,
  selectedAsset,
  onSelectAsset,
  recipient,
  onRecipientChange,
  amount,
  onAmountChange,
  onSetMax,
  onReview,
  formatBalance,
}: {
  assets: SendableAsset[];
  selectedAsset: SendableAsset | null;
  onSelectAsset: (asset: SendableAsset) => void;
  recipient: string;
  onRecipientChange: (val: string) => void;
  amount: string;
  onAmountChange: (val: string) => void;
  onSetMax: () => void;
  onReview: () => void;
  formatBalance: (raw: string, decimals: number) => string;
}) {
  return (
    <>
      <h2 className="mb-4 font-bold text-foreground text-lg">Send Assets</h2>

      {/* Asset selector */}
      <div className="mb-4">
        <label className="mb-1.5 block font-medium text-muted-foreground text-xs">
          Asset
        </label>
        <div className="space-y-1">
          {assets.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No assets with balance
            </p>
          )}
          {assets.map((asset) => {
            const key = asset.address ?? 'native';
            const isSelected = selectedAsset
              ? (selectedAsset.address ?? 'native') === key
              : false;
            return (
              <button
                key={key}
                onClick={() => onSelectAsset(asset)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-[#0066FF] bg-[#0066FF]/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-bold text-xs">
                    {asset.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <span className="font-medium text-foreground text-sm">
                      {asset.symbol}
                    </span>
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      {asset.name}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-muted-foreground text-sm">
                  {formatBalance(asset.balance, asset.decimals)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recipient */}
      <div className="mb-4">
        <label className="mb-1.5 block font-medium text-muted-foreground text-xs">
          Recipient Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => onRecipientChange(e.target.value)}
          placeholder="0x..."
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 font-mono text-foreground text-sm placeholder:text-muted-foreground focus:border-[#0066FF] focus:outline-none"
        />
      </div>

      {/* Amount */}
      <div className="mb-6">
        <label className="mb-1.5 block font-medium text-muted-foreground text-xs">
          Amount
        </label>
        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.0"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2.5 pr-16 font-mono text-foreground text-sm placeholder:text-muted-foreground focus:border-[#0066FF] focus:outline-none"
          />
          <button
            onClick={onSetMax}
            disabled={!selectedAsset}
            className="-translate-y-1/2 absolute top-1/2 right-2 rounded bg-muted px-2 py-0.5 font-medium text-[#0066FF] text-xs hover:bg-muted/80 disabled:opacity-50"
          >
            MAX
          </button>
        </div>
        {selectedAsset && (
          <p className="mt-1 text-muted-foreground text-xs">
            Balance:{' '}
            {formatBalance(selectedAsset.balance, selectedAsset.decimals)}{' '}
            {selectedAsset.symbol}
          </p>
        )}
      </div>

      <button
        onClick={onReview}
        disabled={!selectedAsset || !recipient || !amount}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0066FF] px-4 py-2.5 font-medium text-sm text-white hover:bg-[#0066FF]/90 disabled:opacity-50"
      >
        Review
        <ArrowRight className="h-4 w-4" />
      </button>
    </>
  );
}

function ReviewStep({
  asset,
  recipient,
  amount,
  senderAddress,
  onBack,
  onConfirm,
}: {
  asset: SendableAsset;
  recipient: string;
  amount: string;
  senderAddress: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const truncate = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  return (
    <>
      <h2 className="mb-4 font-bold text-foreground text-lg">
        Review Transfer
      </h2>

      <div className="mb-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Asset</span>
          <span className="font-medium text-foreground text-sm">
            {asset.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Amount</span>
          <span className="font-medium font-mono text-foreground text-sm">
            {amount} {asset.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">From</span>
          <code className="text-foreground text-xs">
            {truncate(senderAddress)}
          </code>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">To</span>
          <code className="text-foreground text-xs">{truncate(recipient)}</code>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Gas</span>
          <span className="text-green-500 text-sm">Sponsored (free)</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 font-medium text-sm hover:bg-muted"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-[#0066FF] px-4 py-2.5 font-medium text-sm text-white hover:bg-[#0066FF]/90"
        >
          Confirm & Send
        </button>
      </div>
    </>
  );
}

function SendingStep() {
  return (
    <div className="flex flex-col items-center py-8">
      <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#0066FF]" />
      <h2 className="mb-1 font-bold text-foreground text-lg">
        Sending Transaction
      </h2>
      <p className="text-center text-muted-foreground text-sm">
        Please wait while your transaction is being processed...
      </p>
    </div>
  );
}

function SuccessStep({
  txHash,
  explorerUrl,
  onClose,
}: {
  txHash: string;
  explorerUrl: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-8">
      <CheckCircle2 className="mb-4 h-10 w-10 text-green-500" />
      <h2 className="mb-1 font-bold text-foreground text-lg">
        Transaction Sent
      </h2>
      <p className="mb-4 text-center text-muted-foreground text-sm">
        Your transaction has been submitted to the network.
      </p>

      <code className="mb-4 rounded bg-muted px-3 py-1.5 text-xs">
        {txHash.slice(0, 10)}...{txHash.slice(-8)}
      </code>

      <div className="flex gap-3">
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Explorer
          </a>
        )}
        <button
          onClick={onClose}
          className="rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-sm text-white hover:bg-[#0066FF]/90"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ErrorStep({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-8">
      <AlertCircle className="mb-4 h-10 w-10 text-red-500" />
      <h2 className="mb-1 font-bold text-foreground text-lg">
        Transaction Failed
      </h2>
      <p className="mb-4 text-center text-muted-foreground text-sm">
        {message}
      </p>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Try Again
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-sm text-white hover:bg-[#0066FF]/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
