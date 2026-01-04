'use client';

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
    if (!isOpen || !nft) return;

    setIsRevealing(true);
    setShowConfetti(false);

    const revealTimer = setTimeout(() => {
      setIsRevealing(false);
      setShowConfetti(true);
    }, 2000);

    const confettiTimer = setTimeout(() => setShowConfetti(false), 5000);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(confettiTimer);
    };
  }, [isOpen, nft]);

  if (!isOpen || !nft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Confetti */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                backgroundColor: ['#0066FF', '#22c55e', '#eab308', '#ef4444'][
                  Math.floor(Math.random() * 4)
                ],
                width: `${6 + Math.random() * 6}px`,
                height: `${6 + Math.random() * 6}px`,
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 mx-4 w-full max-w-sm">
        {/* Card with flip animation */}
        <div
          className="relative mx-auto aspect-square w-full"
          style={{ perspective: '1000px' }}
        >
          <div
            className="relative h-full w-full transition-transform duration-1000"
            style={{
              transformStyle: 'preserve-3d',
              transform: isRevealing ? 'rotateY(0deg)' : 'rotateY(180deg)',
            }}
          >
            {/* Back of card (mystery) */}
            <div
              className="absolute inset-0 flex items-center justify-center rounded-xl border border-[#0066FF]/50 bg-gradient-to-br from-[#0066FF]/10 to-[#0066FF]/5"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="text-center">
                <div className="mb-4 text-7xl">❓</div>
                <p className="animate-pulse font-medium text-foreground">
                  Revealing your NFT...
                </p>
              </div>
            </div>

            {/* Front of card (NFT) */}
            <div
              className="absolute inset-0 overflow-hidden rounded-xl border border-green-500/50 bg-card"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
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

        {/* Info (appears after reveal) */}
        {!isRevealing && (
          <div className="mt-6 animate-fade-in text-center">
            <p className="mb-1 text-muted-foreground text-sm">You received</p>
            <h2 className="mb-1 font-bold text-foreground text-xl">{nft.name}</h2>
            {nft.storyTitle && (
              <p className="mb-4 text-muted-foreground text-sm italic">
                &quot;{nft.storyTitle}&quot;
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Link href={`/nft/${nft.tokenId}`} className="flex-1">
                <Button className="w-full bg-[#0066FF] hover:bg-[#0055DD]">
                  View NFT
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

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
