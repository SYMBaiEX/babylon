'use client';

import { Check, Copy, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ReceiveModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
  chainName: string;
}

export function ReceiveModal({
  open,
  onClose,
  address,
  chainName,
}: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateQr = useCallback(async () => {
    if (!canvasRef.current || !open) return;
    // qrcode is a transitive dependency of @privy-io/react-auth, already installed
    const QRCode = await import('qrcode');
    await QRCode.toCanvas(canvasRef.current, address, {
      width: 220,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  }, [address, open]);

  useEffect(() => {
    generateQr();
  }, [generateQr]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-1 font-bold text-foreground text-lg">
          Receive Assets
        </h2>
        <p className="mb-4 text-muted-foreground text-sm">
          Send tokens or NFTs to this address on{' '}
          <span className="font-medium text-foreground">{chainName}</span>.
        </p>

        <div className="mb-4 flex justify-center rounded-lg bg-white p-4">
          <canvas ref={canvasRef} />
        </div>

        <div className="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <p className="break-all font-mono text-foreground text-sm">
            {address}
          </p>
        </div>

        <button
          onClick={copyAddress}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0066FF] px-4 py-2.5 font-medium text-sm text-white hover:bg-[#0066FF]/90"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Address
            </>
          )}
        </button>

        <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
          <p className="text-center text-muted-foreground text-xs">
            Only send{' '}
            <span className="font-medium text-foreground">{chainName}</span>{' '}
            network assets to this address. Sending assets on other networks may
            result in permanent loss.
          </p>
        </div>
      </div>
    </div>
  );
}
