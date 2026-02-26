'use client';

import { cn } from '@babylon/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { GAME_GUIDE_SLIDES } from './game-guide-slides';

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 300 : -300, opacity: 0 }),
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
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [direction, setDirection] = useState(0);

  const isFirstSlide = currentSlide === 0;
  const isLastSlide = currentSlide === GAME_GUIDE_SLIDES.length - 1;
  const slide = GAME_GUIDE_SLIDES[currentSlide]!;

  const goToNextSlide = useCallback(() => {
    // Block navigation while submitting
    if (isSubmitting) return;

    if (isLastSlide) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentSlide((s) => s + 1);
    }
  }, [isLastSlide, onComplete, isSubmitting]);

  const goToPreviousSlide = useCallback(() => {
    // Block navigation while submitting
    if (isSubmitting) return;

    if (!isFirstSlide) {
      setDirection(-1);
      setCurrentSlide((s) => s - 1);
    }
  }, [isFirstSlide, isSubmitting]);

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
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Modal */}
      <div className="relative flex h-full items-center justify-center overflow-y-auto p-4">
        <div
          className={cn(
            'my-8 w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl transition-all duration-300',
            isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          )}
        >
          {/* Header */}
          <div className="border-border border-b p-6 text-center">
            <p className="text-muted-foreground text-xs uppercase tracking-widest">
              Getting Started
            </p>
            <h2 className="mt-2 font-bold text-2xl tracking-tight">
              {slide.title}
            </h2>
          </div>

          {/* Content */}
          <div className="relative min-h-[280px] overflow-hidden p-6">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentSlide}
                custom={direction}
                variants={SLIDE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                className="space-y-4"
              >
                {slide.points.map((point, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-foreground/90"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0066FF]" />
                    <p className="leading-relaxed">{point}</p>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="border-border border-t p-6">
            {/* Progress */}
            <div className="mb-6 flex justify-center gap-2">
              {GAME_GUIDE_SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-2 rounded-full transition-all duration-200',
                    i === currentSlide
                      ? 'w-6 bg-[#0066FF]'
                      : i < currentSlide
                        ? 'w-2 bg-[#0066FF]/50'
                        : 'w-2 bg-muted-foreground/30'
                  )}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goToPreviousSlide}
                disabled={isFirstSlide || isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-sm transition-colors',
                  isFirstSlide
                    ? 'invisible'
                    : isSubmitting
                      ? 'cursor-not-allowed text-muted-foreground/40'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <p className="text-muted-foreground text-sm">
                {currentSlide + 1} / {GAME_GUIDE_SLIDES.length}
              </p>

              <button
                type="button"
                onClick={goToNextSlide}
                disabled={isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-primary-foreground text-sm transition-colors',
                  isSubmitting
                    ? 'cursor-not-allowed opacity-70'
                    : 'hover:bg-[#0066FF]/90'
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
