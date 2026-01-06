/**
 * Game Guide Unit Tests
 *
 * Tests for the game onboarding guide feature including:
 * - Slide content specification (must match apps/web/.../GameGuideModal.tsx)
 * - Navigation logic specification
 * - Boundary conditions
 * - Display logic specification
 *
 * NOTE: These are SPECIFICATION tests that document expected behavior.
 * The integration tests in game-guide-api.integration.test.ts test the
 * actual API endpoints with real server requests.
 *
 * If the slide content in GameGuideModal.tsx changes, update this spec.
 *
 * Run with: bun test unit/game-guide.test.ts
 */

import { describe, expect, test } from 'bun:test';

/**
 * Expected slide content - must match GAME_GUIDE_SLIDES in:
 * apps/web/src/components/onboarding/GameGuideModal.tsx
 *
 * This is a specification that documents the required content.
 */
const GAME_GUIDE_SLIDES = [
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
] as const;

describe('Game Guide - Slide Content', () => {
  test('should have exactly 5 slides', () => {
    expect(GAME_GUIDE_SLIDES.length).toBe(5);
  });

  test('each slide should have a non-empty title', () => {
    for (const slide of GAME_GUIDE_SLIDES) {
      expect(slide.title).toBeDefined();
      expect(slide.title.length).toBeGreaterThan(0);
    }
  });

  test('each slide should have at least 3 points', () => {
    for (const slide of GAME_GUIDE_SLIDES) {
      expect(slide.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('no slide should have more than 5 points', () => {
    for (const slide of GAME_GUIDE_SLIDES) {
      expect(slide.points.length).toBeLessThanOrEqual(5);
    }
  });

  test('all points should be non-empty strings', () => {
    for (const slide of GAME_GUIDE_SLIDES) {
      for (const point of slide.points) {
        expect(typeof point).toBe('string');
        expect(point.length).toBeGreaterThan(10); // Meaningful content
      }
    }
  });

  test('slide titles should be unique', () => {
    const titles = GAME_GUIDE_SLIDES.map((s) => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });

  test('first slide should be Welcome', () => {
    expect(GAME_GUIDE_SLIDES[0]!.title).toContain('Welcome');
  });

  test('last slide should be the CTA slide', () => {
    const lastSlide = GAME_GUIDE_SLIDES[GAME_GUIDE_SLIDES.length - 1]!;
    expect(lastSlide.title).toContain('Trade');
    // Should contain call to action
    const allText = lastSlide.points.join(' ');
    expect(allText).toContain('Get started');
  });
});

// ============================================
// NAVIGATION LOGIC TESTS
// ============================================
// NOTE: These tests verify the SPECIFICATION of navigation behavior.
// The actual React component uses useState/useCallback which can't be
// unit tested without React Testing Library. These tests document the
// expected state machine behavior that the component must implement.
// ============================================

describe('Game Guide - Navigation Logic (Specification)', () => {
  // State machine that documents expected navigation behavior
  class SlideNavigator {
    currentSlide = 0;
    completed = false;
    totalSlides: number;

    constructor(totalSlides: number) {
      this.totalSlides = totalSlides;
    }

    get isFirstSlide() {
      return this.currentSlide === 0;
    }

    get isLastSlide() {
      return this.currentSlide === this.totalSlides - 1;
    }

    goToNext(): boolean {
      if (this.isLastSlide) {
        this.completed = true;
        return true; // Completed
      }
      this.currentSlide++;
      return false;
    }

    goToPrevious(): boolean {
      if (this.isFirstSlide) {
        return false; // No action
      }
      this.currentSlide--;
      return true;
    }

    goToSlide(index: number): boolean {
      if (index < 0 || index >= this.totalSlides) {
        return false;
      }
      this.currentSlide = index;
      return true;
    }
  }

  test('should start at slide 0', () => {
    const nav = new SlideNavigator(5);
    expect(nav.currentSlide).toBe(0);
    expect(nav.isFirstSlide).toBe(true);
    expect(nav.isLastSlide).toBe(false);
  });

  test('goToNext should increment slide', () => {
    const nav = new SlideNavigator(5);
    nav.goToNext();
    expect(nav.currentSlide).toBe(1);
  });

  test('goToNext on last slide should mark completed', () => {
    const nav = new SlideNavigator(5);
    nav.currentSlide = 4;
    expect(nav.isLastSlide).toBe(true);
    const completed = nav.goToNext();
    expect(completed).toBe(true);
    expect(nav.completed).toBe(true);
  });

  test('goToPrevious should decrement slide', () => {
    const nav = new SlideNavigator(5);
    nav.currentSlide = 2;
    nav.goToPrevious();
    expect(nav.currentSlide).toBe(1);
  });

  test('goToPrevious on first slide should do nothing', () => {
    const nav = new SlideNavigator(5);
    expect(nav.isFirstSlide).toBe(true);
    const result = nav.goToPrevious();
    expect(result).toBe(false);
    expect(nav.currentSlide).toBe(0);
  });

  test('should navigate through all slides to completion', () => {
    const nav = new SlideNavigator(5);
    const visitedSlides: number[] = [];

    while (!nav.completed) {
      visitedSlides.push(nav.currentSlide);
      nav.goToNext();
    }

    expect(visitedSlides).toEqual([0, 1, 2, 3, 4]);
    expect(nav.completed).toBe(true);
  });

  test('goToSlide should reject invalid indices', () => {
    const nav = new SlideNavigator(5);
    expect(nav.goToSlide(-1)).toBe(false);
    expect(nav.goToSlide(5)).toBe(false);
    expect(nav.goToSlide(100)).toBe(false);
    expect(nav.currentSlide).toBe(0); // Unchanged
  });

  test('goToSlide should accept valid indices', () => {
    const nav = new SlideNavigator(5);
    expect(nav.goToSlide(3)).toBe(true);
    expect(nav.currentSlide).toBe(3);
    expect(nav.goToSlide(0)).toBe(true);
    expect(nav.currentSlide).toBe(0);
  });

  test('boundary: single slide guide', () => {
    const nav = new SlideNavigator(1);
    expect(nav.isFirstSlide).toBe(true);
    expect(nav.isLastSlide).toBe(true);
    nav.goToNext();
    expect(nav.completed).toBe(true);
  });

  test('boundary: two slide guide', () => {
    const nav = new SlideNavigator(2);
    expect(nav.isFirstSlide).toBe(true);
    expect(nav.isLastSlide).toBe(false);
    nav.goToNext();
    expect(nav.currentSlide).toBe(1);
    expect(nav.isLastSlide).toBe(true);
    nav.goToNext();
    expect(nav.completed).toBe(true);
  });
});

// ============================================
// SHOW/HIDE LOGIC TESTS
// ============================================
// NOTE: These tests verify the SPECIFICATION of when the guide should show.
// The actual logic lives in GameGuideProvider.tsx and uses React hooks.
// These tests document the expected behavior that the provider must implement.
// ============================================

describe('Game Guide - Display Logic (Specification)', () => {
  interface UserState {
    authenticated: boolean;
    profileComplete: boolean;
    isActor: boolean;
    gameGuideCompletedAt: string | null;
    needsOnboarding: boolean;
    needsOnchain: boolean;
  }

  function shouldShowGuide(state: UserState): boolean {
    return (
      state.authenticated &&
      state.profileComplete &&
      !state.isActor &&
      !state.gameGuideCompletedAt &&
      !state.needsOnboarding &&
      !state.needsOnchain
    );
  }

  const baseUser: UserState = {
    authenticated: true,
    profileComplete: true,
    isActor: false,
    gameGuideCompletedAt: null,
    needsOnboarding: false,
    needsOnchain: false,
  };

  test('should show for first-time authenticated user with complete profile', () => {
    expect(shouldShowGuide(baseUser)).toBe(true);
  });

  test('should NOT show for unauthenticated user', () => {
    expect(shouldShowGuide({ ...baseUser, authenticated: false })).toBe(false);
  });

  test('should NOT show for user still in profile onboarding', () => {
    expect(shouldShowGuide({ ...baseUser, needsOnboarding: true })).toBe(false);
  });

  test('should NOT show for user in on-chain registration step', () => {
    expect(shouldShowGuide({ ...baseUser, needsOnchain: true })).toBe(false);
  });

  test('should NOT show for actors/NPCs', () => {
    expect(shouldShowGuide({ ...baseUser, isActor: true })).toBe(false);
  });

  test('should NOT show if already completed', () => {
    expect(
      shouldShowGuide({
        ...baseUser,
        gameGuideCompletedAt: '2025-01-06T12:00:00.000Z',
      })
    ).toBe(false);
  });

  test('should NOT show for incomplete profile', () => {
    expect(shouldShowGuide({ ...baseUser, profileComplete: false })).toBe(
      false
    );
  });

  test('multiple conditions: actor with incomplete profile', () => {
    expect(
      shouldShowGuide({
        ...baseUser,
        isActor: true,
        profileComplete: false,
      })
    ).toBe(false);
  });

  test('edge case: all conditions false except authenticated', () => {
    expect(
      shouldShowGuide({
        authenticated: true,
        profileComplete: false,
        isActor: true,
        gameGuideCompletedAt: '2025-01-01T00:00:00.000Z',
        needsOnboarding: true,
        needsOnchain: true,
      })
    ).toBe(false);
  });
});

// ============================================
// COMPLETION TIMESTAMP TESTS
// ============================================

describe('Game Guide - Completion Tracking', () => {
  test('completion timestamp should be valid ISO-8601', () => {
    const timestamp = new Date().toISOString();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  test('should parse completion timestamp correctly', () => {
    const timestamp = '2025-01-06T19:52:48.599Z';
    const date = new Date(timestamp);
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(6);
  });

  test('should detect completed vs not completed', () => {
    const hasCompleted = (timestamp: string | null): boolean =>
      Boolean(timestamp);

    expect(hasCompleted(null)).toBe(false);
    expect(hasCompleted('2025-01-06T19:52:48.599Z')).toBe(true);
  });

  test('should handle empty string as not completed', () => {
    // Empty string is falsy in JS, should be treated as not completed
    const timestamp = '';
    expect(Boolean(timestamp)).toBe(false);
  });
});

// ============================================
// KEYBOARD NAVIGATION TESTS
// ============================================

describe('Game Guide - Keyboard Navigation', () => {
  type KeyHandler = (key: string) => void;

  function createKeyboardHandler(
    onNext: () => void,
    onPrev: () => void
  ): KeyHandler {
    return (key: string) => {
      if (key === 'ArrowRight' || key === 'Enter') {
        onNext();
      } else if (key === 'ArrowLeft') {
        onPrev();
      }
      // Escape is intentionally not handled (cannot skip)
    };
  }

  test('ArrowRight should trigger next', () => {
    let nextCalled = false;
    const handler = createKeyboardHandler(
      () => (nextCalled = true),
      () => {}
    );
    handler('ArrowRight');
    expect(nextCalled).toBe(true);
  });

  test('Enter should trigger next', () => {
    let nextCalled = false;
    const handler = createKeyboardHandler(
      () => (nextCalled = true),
      () => {}
    );
    handler('Enter');
    expect(nextCalled).toBe(true);
  });

  test('ArrowLeft should trigger previous', () => {
    let prevCalled = false;
    const handler = createKeyboardHandler(
      () => {},
      () => (prevCalled = true)
    );
    handler('ArrowLeft');
    expect(prevCalled).toBe(true);
  });

  test('Escape should NOT close modal (no skip)', () => {
    let anyCalled = false;
    const handler = createKeyboardHandler(
      () => (anyCalled = true),
      () => (anyCalled = true)
    );
    handler('Escape');
    expect(anyCalled).toBe(false);
  });

  test('random keys should be ignored', () => {
    let anyCalled = false;
    const handler = createKeyboardHandler(
      () => (anyCalled = true),
      () => (anyCalled = true)
    );
    handler('a');
    handler('Space');
    handler('Tab');
    expect(anyCalled).toBe(false);
  });
});

// ============================================
// PROGRESS INDICATOR TESTS
// ============================================

describe('Game Guide - Progress Indicator', () => {
  function getProgressState(
    currentSlide: number,
    totalSlides: number
  ): ('current' | 'completed' | 'pending')[] {
    return Array.from({ length: totalSlides }, (_, i) => {
      if (i === currentSlide) return 'current';
      if (i < currentSlide) return 'completed';
      return 'pending';
    });
  }

  test('first slide should show first dot as current', () => {
    const state = getProgressState(0, 5);
    expect(state).toEqual([
      'current',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  test('middle slide should show correct states', () => {
    const state = getProgressState(2, 5);
    expect(state).toEqual([
      'completed',
      'completed',
      'current',
      'pending',
      'pending',
    ]);
  });

  test('last slide should show all previous as completed', () => {
    const state = getProgressState(4, 5);
    expect(state).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'current',
    ]);
  });

  test('progress display text format', () => {
    const formatProgress = (current: number, total: number) =>
      `${current + 1} / ${total}`;
    expect(formatProgress(0, 5)).toBe('1 / 5');
    expect(formatProgress(2, 5)).toBe('3 / 5');
    expect(formatProgress(4, 5)).toBe('5 / 5');
  });
});
