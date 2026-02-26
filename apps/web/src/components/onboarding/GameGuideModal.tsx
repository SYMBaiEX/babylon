'use client';

import { cn } from '@babylon/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { GAME_GUIDE_SLIDES } from './game-guide-slides';

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
  exit: {},
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

interface GameGuideModalProps {
  isOpen: boolean;
  onComplete: () => void;
  isSubmitting?: boolean;
}

/**
 * 5-slide onboarding tutorial explaining how Babylon works.
 * Shown after profile setup; users must complete all slides.
 */
export function GameGuideModal({
  isOpen,
  onComplete,
  isSubmitting = false,
}: GameGuideModalProps) {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [direction, setDirection] = useState(0);

  const isFirstSlide = currentSlide === 0;
  const isLastSlide = currentSlide === GAME_GUIDE_SLIDES.length - 1;
  const slide = GAME_GUIDE_SLIDES[currentSlide]!;

  const goToNextSlide = useCallback(() => {
    if (isSubmitting) return;

    if (isLastSlide) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentSlide((s) => s + 1);
    }
  }, [isLastSlide, onComplete, isSubmitting]);

  const goToPreviousSlide = useCallback(() => {
    if (isSubmitting) return;

    if (!isFirstSlide) {
      setDirection(-1);
      setCurrentSlide((s) => s - 1);
    }
  }, [isFirstSlide, isSubmitting]);

  const handleSkip = useCallback(() => {
    if (isSubmitting) return;
    onComplete();
  }, [onComplete, isSubmitting]);

  const handleCtaClick = useCallback(
    (href: string) => {
      onComplete();
      router.push(href);
    },
    [onComplete, router],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || isSubmitting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goToNextSlide();
      else if (e.key === 'ArrowLeft') goToPreviousSlide();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, goToNextSlide, goToPreviousSlide]);

  // Fade-in animation & reset state on close
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    setCurrentSlide(0);
    setDirection(0);
    return undefined;
  }, [isOpen]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300',
          isVisible ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Modal */}
      <div className="relative flex h-full items-center justify-center overflow-y-auto p-4">
        <div
          className={cn(
            'my-8 w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl transition-all duration-300',
            isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-border border-b px-6 py-4">
            <p className="text-muted-foreground text-xs uppercase tracking-widest">
              Getting Started
            </p>
            {!isLastSlide && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className={cn(
                  'text-muted-foreground text-sm transition-colors',
                  isSubmitting
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:text-foreground',
                )}
              >
                Skip
              </button>
            )}
          </div>

          {/* Content */}
          <div className="relative min-h-[270px] overflow-hidden p-6 sm:min-h-[200px]">
            {/* Progress dots */}
            <div className="mb-5 flex justify-center gap-2">
              {GAME_GUIDE_SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-2 rounded-full transition-all duration-200',
                    i === currentSlide
                      ? 'w-6 bg-[#0066FF]'
                      : i < currentSlide
                        ? 'w-2 bg-[#0066FF]/50'
                        : 'w-2 bg-muted-foreground/30',
                  )}
                />
              ))}
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentSlide}
                variants={CONTAINER_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col items-center text-center"
              >
                {/* Title */}
                <motion.h2
                  variants={ITEM_VARIANTS}
                  className="mb-3 font-bold text-2xl tracking-tight"
                >
                  {slide.title}
                </motion.h2>

                {/* Description */}
                <motion.p
                  variants={ITEM_VARIANTS}
                  className="max-w-md text-foreground/80 text-sm leading-relaxed sm:text-base"
                >
                  {slide.description}
                </motion.p>

                {/* CTAs (last slide only) */}
                {slide.ctas && (
                  <motion.div
                    variants={ITEM_VARIANTS}
                    className="mt-6 flex flex-col gap-3 sm:flex-row"
                  >
                    {slide.ctas.map((cta, i) => (
                      <button
                        key={cta.href}
                        type="button"
                        onClick={() => handleCtaClick(cta.href)}
                        className={cn(
                          'rounded-lg px-4 py-2 font-medium text-sm transition-colors',
                          i === 0
                            ? 'bg-[#0066FF] text-primary-foreground hover:bg-[#0066FF]/90'
                            : 'border border-border text-foreground hover:bg-muted',
                        )}
                      >
                        {cta.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="border-border border-t p-6">
            {/* Navigation */}
            <div className="flex items-center justify-between">
              {!isFirstSlide ? (
                <button
                  type="button"
                  onClick={goToPreviousSlide}
                  disabled={isSubmitting}
                  className={cn(
                    'flex items-center gap-1 font-medium text-sm transition-colors',
                    isSubmitting
                      ? 'cursor-not-allowed text-muted-foreground/40'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={goToNextSlide}
                disabled={isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-primary-foreground text-sm transition-colors',
                  isSubmitting
                    ? 'cursor-not-allowed opacity-70'
                    : 'hover:bg-[#0066FF]/90',
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : isLastSlide ? (
                  'Start Playing'
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
