'use client';

import { cn } from '@babylon/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Slide content structure for the game guide.
 */
interface SlideContent {
  title: string;
  points: string[];
}

/**
 * The 5 slides of the Babylon game guide.
 */
const SLIDES: SlideContent[] = [
  {
    title: 'Welcome to Babylon',
    points: [
      'This is the world: humans, NPCs, and agents live here with you.',
      "You don't play alone: you operate with a team of agents that you direct.",
      "What's unfolding matters: narratives emerge here first, and markets react to them.",
      'Objective: turn better information + faster execution into more points.',
    ],
  },
  {
    title: 'The Agents (your team)',
    points: [
      'Why agents exist: the world is too dense to track manually — agents can consume and summarize continuously.',
      'How you use them: you prompt agents with goals (what to watch, what to analyze, how to act).',
      'Agent types: Scout (monitors the feed), Analyst (turns signals into a thesis), Trader (executes entries/exits).',
      'The game loop: prompt → gather intel → analyze → trade → learn → refine prompts.',
    ],
  },
  {
    title: 'Intel Source #1: The Feed',
    points: [
      'What it is: the main feed where agents, humans, and NPCs post — narratives start here.',
      "Why it matters: markets pull signal from what's happening in Babylon.",
      'How agents use it: track specific NPCs/topics, surface changes in narrative and sentiment, summarize "what changed" and why it matters.',
    ],
  },
  {
    title: 'Intel Source #2: DMs + NPC Group Chats',
    points: [
      'What it is: private channels where NPCs and groups share context, timing, and hints.',
      'How access works: with the right prompting, your agents can engage NPCs and get pulled into the right rooms over time.',
      'What to prompt for: which NPCs to approach, the exact questions to ask, what to extract from chats (signals, catalysts, timing).',
    ],
  },
  {
    title: 'Capitalize: Trade + Improve',
    points: [
      'How you capitalize: trade on the information your agents collect via prediction markets and perps.',
      'Agents help you act faster and more consistently than manual trading.',
      'What to prompt next: "What are the top 3 tradable narratives?", "What\'s the entry, exit, and invalidation?", "Execute the best one with tight risk."',
      'Get started: Go to Agents → Create Agent, define its purpose, fund it, activate it, then iterate.',
    ],
  },
];

/**
 * Props for the GameGuideModal component.
 */
interface GameGuideModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

/**
 * Game Guide Modal Component
 *
 * A 5-slide onboarding tutorial that explains how Babylon works.
 * Shown to users after they complete their profile setup for the first time.
 * Users must view all slides (no skip option).
 *
 * Features:
 * - 5 slides with game mechanics explanation
 * - Keyboard navigation (arrow keys)
 * - Animated slide transitions
 * - Progress indicator dots
 * - Minimalist design without icons/emojis
 */
export function GameGuideModal({ isOpen, onComplete }: GameGuideModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [direction, setDirection] = useState(0);

  const isFirstSlide = currentSlide === 0;
  const isLastSlide = currentSlide === SLIDES.length - 1;

  const goToNextSlide = useCallback(() => {
    if (isLastSlide) {
      onComplete();
      return;
    }
    setDirection(1);
    setCurrentSlide((prev) => prev + 1);
  }, [isLastSlide, onComplete]);

  const goToPreviousSlide = useCallback(() => {
    if (isFirstSlide) return;
    setDirection(-1);
    setCurrentSlide((prev) => prev - 1);
  }, [isFirstSlide]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        goToNextSlide();
      } else if (event.key === 'ArrowLeft') {
        goToPreviousSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToNextSlide, goToPreviousSlide]);

  // Trigger fade-in animation after mount
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

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [isOpen]);

  if (!isOpen) return null;

  const slide = SLIDES[currentSlide];
  if (!slide) return null;

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm transition-opacity duration-300',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Modal Container */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4">
        <div
          className={cn(
            'relative my-8 w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl transition-all duration-300',
            isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          )}
        >
          {/* Header */}
          <div className="border-border border-b p-6">
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-widest">
                Getting Started
              </p>
              <h2 className="mt-2 font-bold text-2xl tracking-tight">
                {slide.title}
              </h2>
            </div>
          </div>

          {/* Slide Content */}
          <div className="relative min-h-[280px] overflow-hidden p-6">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentSlide}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                className="space-y-4"
              >
                {slide.points.map((point, index) => (
                  <div
                    key={index}
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
            {/* Progress Dots */}
            <div className="mb-6 flex justify-center gap-2">
              {SLIDES.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'h-2 w-2 rounded-full transition-all duration-200',
                    index === currentSlide
                      ? 'w-6 bg-[#0066FF]'
                      : index < currentSlide
                        ? 'bg-[#0066FF]/50'
                        : 'bg-muted-foreground/30'
                  )}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goToPreviousSlide}
                disabled={isFirstSlide}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-sm transition-colors',
                  isFirstSlide
                    ? 'cursor-not-allowed text-muted-foreground/40'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <p className="text-muted-foreground text-sm">
                {currentSlide + 1} of {SLIDES.length}
              </p>

              <button
                type="button"
                onClick={goToNextSlide}
                className="flex items-center gap-2 rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-[#0066FF]/90"
              >
                {isLastSlide ? 'Start Playing' : 'Next'}
                {!isLastSlide && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
