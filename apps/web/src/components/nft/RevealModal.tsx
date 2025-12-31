'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { MintConfirmResponse } from '@/types/nft';

interface RevealModalProps {
  isOpen: boolean;
  nft: MintConfirmResponse['nft'] | null;
  onClose: () => void;
}

export function RevealModal({ isOpen, nft, onClose }: RevealModalProps) {
  const [isRevealing, setIsRevealing] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!isOpen || !nft) {
      return;
    }

    // Start reveal animation
    setIsRevealing(true);
    setShowConfetti(false);

    // Flip card after delay
    const revealTimer = setTimeout(() => {
      setIsRevealing(false);
      setShowConfetti(true);
    }, 2000);

    // Hide confetti after a while
    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(confettiTimer);
    };
  }, [isOpen, nft]);

  if (!isOpen || !nft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Confetti Effect */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                backgroundColor: [
                  '#0066FF',
                  '#a855f7',
                  '#22c55e',
                  '#eab308',
                  '#ef4444',
                ][Math.floor(Math.random() * 5)],
                width: `${8 + Math.random() * 8}px`,
                height: `${8 + Math.random() * 8}px`,
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
              }}
            />
          ))}
        </div>
      )}

      {/* Modal Content */}
      <div className="relative z-10 mx-4 w-full max-w-md">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="-right-2 -top-2 absolute z-20 rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Card Container with Flip Animation */}
        <div
          className="perspective-1000 relative mx-auto aspect-square w-full max-w-sm"
          style={{ perspective: '1000px' }}
        >
          <div
            className={`relative h-full w-full transition-transform duration-1000 ${
              isRevealing ? '' : 'rotate-y-180'
            }`}
            style={{
              transformStyle: 'preserve-3d',
              transform: isRevealing ? 'rotateY(0deg)' : 'rotateY(180deg)',
            }}
          >
            {/* Card Back (Mystery) */}
            <div
              className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-[#0066FF]/50 bg-gradient-to-br from-[#0066FF]/20 via-purple-500/20 to-[#0066FF]/20 shadow-2xl shadow-[#0066FF]/20"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="text-center">
                <div className="mb-4 text-8xl">❓</div>
                <p className="animate-pulse font-bold text-foreground text-lg">
                  Revealing...
                </p>
              </div>
            </div>

            {/* Card Front (NFT) */}
            <div
              className="absolute inset-0 overflow-hidden rounded-2xl border-2 border-green-500/50 bg-card shadow-2xl shadow-green-500/20"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="relative aspect-square w-full">
                <Image
                  src={nft.imageUrl || nft.thumbnailUrl || ''}
                  alt={nft.name}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        {/* NFT Info (shown after reveal) */}
        {!isRevealing && (
          <div className="mt-6 animate-fade-in text-center">
            <p className="mb-2 text-muted-foreground text-sm">You received</p>
            <h2 className="mb-4 font-bold text-2xl text-foreground">
              {nft.name}
            </h2>
            {nft.storyTitle && (
              <p className="mb-4 text-muted-foreground italic">
                &quot;{nft.storyTitle}&quot;
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href={`/nft/${nft.tokenId}`}>
                <Button
                  variant="default"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  View Your NFT
                </Button>
              </Link>
              <Button variant="outline" size="lg" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Keyframe Styles */}
      <style jsx global>{`
        @keyframes confetti {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
