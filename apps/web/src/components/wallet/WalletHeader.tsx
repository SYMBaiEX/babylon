'use client';

import { CHAIN } from '@babylon/shared';
import { useFundWallet } from '@privy-io/react-auth';
import { Check, Copy, ExternalLink, QrCode, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ReceiveModal } from './ReceiveModal';

interface WalletHeaderProps {
  address: string;
  chainName?: string;
}

export function WalletHeader({ address, chainName }: WalletHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const { fundWallet } = useFundWallet();

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const resolvedChainName = chainName ?? CHAIN.name;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFund = () => {
    fundWallet({
      address,
      options: { chain: CHAIN, asset: 'native-currency' },
    });
  };

  const explorerUrl = getAddressExplorerUrl(address);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0066FF]/10">
            <Wallet className="h-5 w-5 text-[#0066FF]" />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-xl">Wallet</h1>
            <div className="flex items-center gap-2">
              <code className="text-muted-foreground text-sm">
                {truncatedAddress}
              </code>
              <button
                onClick={copyAddress}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copy address"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => setReceiveOpen(true)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Show QR code"
              >
                <QrCode className="h-3.5 w-3.5" />
              </button>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="View on explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                {resolvedChainName}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleFund}
            className="rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-sm text-white hover:bg-[#0066FF]/90"
          >
            Fund Wallet
          </button>
        </div>
      </div>

      <ReceiveModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        address={address}
        chainName={resolvedChainName}
      />
    </>
  );
}

function getAddressExplorerUrl(address: string): string | null {
  const chainId = CHAIN.id;
  switch (chainId) {
    case 1:
      return `https://etherscan.io/address/${address}`;
    case 11155111:
      return `https://sepolia.etherscan.io/address/${address}`;
    case 8453:
      return `https://basescan.org/address/${address}`;
    case 84532:
      return `https://sepolia.basescan.org/address/${address}`;
    default:
      return null;
  }
}
