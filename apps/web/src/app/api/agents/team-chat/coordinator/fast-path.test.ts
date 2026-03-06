/**
 * Unit Tests for Fast-Path Router (OPT-6)
 *
 * Tests the intent classifier that allows read-only queries and greetings
 * to skip the LLM decision loop. Critical safety property: messages
 * containing agent action verbs must NEVER be fast-pathed.
 *
 * Coverage:
 * - Greeting detection (various forms, punctuation, case)
 * - Greeting rejection (complex sentences, questions after greeting)
 * - Agent action verb exclusion guard (buy, sell, trade, post, etc.)
 * - Mixed-intent rejection (read-only keyword + action verb)
 * - CHECK_PERPS matching with and without ticker extraction
 * - CHECK_USER_PNL matching
 * - CHECK_FEED_POSTS matching
 * - CHECK_RECENT_MARKET_TRADES matching
 * - CHECK_PREDICTIONS matching
 * - CHECK_TEAM_CHAT matching
 * - Unrecognized messages return null
 * - Case insensitivity
 * - Ticker normalization to uppercase
 */

import { describe, expect, it } from 'bun:test';
import { type FastPathMatch, tryFastPath } from './fast-path';

// =============================================================================
// Greeting Detection
// =============================================================================

describe('tryFastPath', () => {
  describe('greetings', () => {
    it.each([
      'hi',
      'Hi',
      'HI',
      'hello',
      'Hello!',
      'hey',
      'Hey!',
      'howdy',
      'sup',
      'yo',
      'gm',
      'GM',
      'good morning',
      'Good Morning!',
      'good evening',
      'good afternoon',
      "what's up",
      "What's up?",
      'whats up',
    ])('returns "greeting" for: "%s"', (input) => {
      expect(tryFastPath(input)).toBe('greeting');
    });

    it('returns "greeting" for greetings with trailing whitespace', () => {
      expect(tryFastPath('  hello  ')).toBe('greeting');
    });

    it('returns "greeting" for greetings with punctuation', () => {
      expect(tryFastPath('hello!')).toBe('greeting');
      expect(tryFastPath('hey?')).toBe('greeting');
      expect(tryFastPath('hi.')).toBe('greeting');
    });
  });

  describe('greeting with additional content (not pure greeting)', () => {
    it('routes greeting + market query to CHECK_PERPS', () => {
      const result = tryFastPath('hey what are the markets doing') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
    });

    it('routes greeting + portfolio query to CHECK_USER_PNL', () => {
      const result = tryFastPath('hi can you check my portfolio') as FastPathMatch;
      expect(result.action).toBe('CHECK_USER_PNL');
    });

    it('routes greeting + price query to CHECK_PERPS', () => {
      const result = tryFastPath('I wanted to say hello and check prices') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
    });

    it('falls through to null for greeting + unrecognized content', () => {
      expect(tryFastPath('hey how are you doing today')).toBe(null);
    });
  });

  // ===========================================================================
  // Agent Action Verb Exclusion Guard (CRITICAL SAFETY)
  // ===========================================================================

  describe('agent action verb exclusion', () => {
    const actionVerbs = [
      'buy',
      'sell',
      'trade',
      'open',
      'close',
      'post',
      'comment',
      'tell',
      'ask',
      'dispatch',
      'send',
      'create',
      'make',
      'write',
      'reply',
      'share',
      'execute',
      'place',
      'submit',
      'transfer',
    ];

    it.each(actionVerbs)(
      'returns null when message contains verb "%s"',
      (verb) => {
        // Even with a read-only keyword, action verb forces null
        expect(tryFastPath(`${verb} on the market`)).toBe(null);
      }
    );

    it('returns null for mixed intent: read-only keyword + action verb', () => {
      expect(tryFastPath("What's the TSLAI price and buy some")).toBe(null);
      expect(tryFastPath('Check my portfolio and open a long')).toBe(null);
      expect(tryFastPath('Show me the feed and post something')).toBe(null);
      expect(tryFastPath('Show predictions and place a bet')).toBe(null);
    });

    it('returns null for dispatch commands disguised as questions', () => {
      expect(
        tryFastPath('Can you tell my agent to check the market?')
      ).toBe(null);
      expect(
        tryFastPath('Ask the trading bot about TSLAI')
      ).toBe(null);
    });
  });

  // ===========================================================================
  // CHECK_USER_PNL
  // ===========================================================================

  describe('CHECK_USER_PNL', () => {
    it.each([
      'show my portfolio',
      'what is my balance',
      "what's my pnl",
      'my P&L',
      'show my profit and loss',
      'how are my positions doing',
      'check my holdings',
      'my account',
    ])('matches: "%s"', (input) => {
      const result = tryFastPath(input) as FastPathMatch;
      expect(result).not.toBe(null);
      expect(result).not.toBe('greeting');
      expect(result.action).toBe('CHECK_USER_PNL');
      expect(result.parameters).toEqual({});
    });
  });

  // ===========================================================================
  // CHECK_PERPS
  // ===========================================================================

  describe('CHECK_PERPS', () => {
    it('matches price queries without ticker', () => {
      const result = tryFastPath('show me the prices') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
      expect(result.parameters).toEqual({});
    });

    it('matches market queries', () => {
      const result = tryFastPath('how are the markets') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
    });

    it('matches perps query', () => {
      const result = tryFastPath('show perps') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
    });

    it('matches perpetuals query', () => {
      const result = tryFastPath('check the perpetuals') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
    });

    it('matches stocks query', () => {
      const result = tryFastPath('how are the stocks') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
    });

    it('extracts TSLAI ticker', () => {
      const result = tryFastPath('what is TSLAI price') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
      expect(result.parameters).toEqual({ ticker: 'TSLAI' });
    });

    it('extracts NVDAI ticker (case insensitive)', () => {
      const result = tryFastPath('nvdai price please') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
      expect(result.parameters).toEqual({ ticker: 'NVDAI' });
    });

    it('extracts AIPPL ticker', () => {
      const result = tryFastPath('show me AIPPL stock') as FastPathMatch;
      expect(result.action).toBe('CHECK_PERPS');
      expect(result.parameters).toEqual({ ticker: 'AIPPL' });
    });

    it.each(['AMSAI', 'GOAI', 'METAI', 'NFLAI'])(
      'extracts %s ticker',
      (ticker) => {
        const result = tryFastPath(
          `${ticker} market data`
        ) as FastPathMatch;
        expect(result.action).toBe('CHECK_PERPS');
        expect(result.parameters).toEqual({ ticker });
      }
    );

    it('normalizes lowercase ticker to uppercase', () => {
      const result = tryFastPath('tslai price') as FastPathMatch;
      expect(result.parameters).toEqual({ ticker: 'TSLAI' });
    });
  });

  // ===========================================================================
  // CHECK_FEED_POSTS
  // ===========================================================================

  describe('CHECK_FEED_POSTS', () => {
    it.each([
      'show me the feed',
      "what's on the feed",
      'latest posts',
      'show trending',
      'check the timeline',
      "what's happening on social",
      "what's happening",
    ])('matches: "%s"', (input) => {
      const result = tryFastPath(input) as FastPathMatch;
      expect(result).not.toBe(null);
      expect(result).not.toBe('greeting');
      expect(result.action).toBe('CHECK_FEED_POSTS');
      expect(result.parameters).toEqual({});
    });
  });

  // ===========================================================================
  // CHECK_RECENT_MARKET_TRADES
  // ===========================================================================

  describe('CHECK_RECENT_MARKET_TRADES', () => {
    it.each([
      'show recent trades',
      'market activity',
      'market trades',
      'trading activity',
      'trading history',
      'latest trades',
    ])('matches: "%s"', (input) => {
      const result = tryFastPath(input) as FastPathMatch;
      expect(result).not.toBe(null);
      expect(result).not.toBe('greeting');
      expect(result.action).toBe('CHECK_RECENT_MARKET_TRADES');
      expect(result.parameters).toEqual({});
    });
  });

  // ===========================================================================
  // CHECK_PREDICTIONS
  // ===========================================================================

  describe('CHECK_PREDICTIONS', () => {
    it.each([
      'show predictions',
      'prediction markets',
      'any interesting bets',
      'show me the betting',
      'event market',
    ])('matches: "%s"', (input) => {
      const result = tryFastPath(input) as FastPathMatch;
      expect(result).not.toBe(null);
      expect(result).not.toBe('greeting');
      expect(result.action).toBe('CHECK_PREDICTIONS');
      expect(result.parameters).toEqual({});
    });
  });

  // ===========================================================================
  // CHECK_TEAM_CHAT
  // ===========================================================================

  describe('CHECK_TEAM_CHAT', () => {
    it.each([
      'show chat history',
      'what was the conversation about',
      'check the chat log',
      'show previous messages',
      'what did my agent say',
      'what did TradingBot say earlier',
    ])('matches: "%s"', (input) => {
      const result = tryFastPath(input) as FastPathMatch;
      expect(result).not.toBe(null);
      expect(result).not.toBe('greeting');
      expect(result.action).toBe('CHECK_TEAM_CHAT');
      expect(result.parameters).toEqual({});
    });
  });

  // ===========================================================================
  // Unrecognized / fallthrough
  // ===========================================================================

  describe('unrecognized messages', () => {
    it.each([
      'what is Babylon?',
      'how does this work?',
      'thanks',
      'ok cool',
      'I understand',
      'what should I do next?',
      'tell me about yourself',
    ])('returns null for: "%s"', (input) => {
      expect(tryFastPath(input)).toBe(null);
    });

    it('routes "explain prediction markets to me" to CHECK_PREDICTIONS (has keyword)', () => {
      const result = tryFastPath('explain prediction markets to me') as FastPathMatch;
      expect(result.action).toBe('CHECK_PREDICTIONS');
    });

    it('returns null for empty string', () => {
      expect(tryFastPath('')).toBe(null);
    });

    it('returns null for whitespace only', () => {
      expect(tryFastPath('   ')).toBe(null);
    });
  });

  // ===========================================================================
  // Priority / ordering
  // ===========================================================================

  describe('priority ordering', () => {
    it('CHECK_USER_PNL takes priority over CHECK_PERPS for "my position prices"', () => {
      // "position" matches PNL, "prices" matches PERPS — PNL comes first
      const result = tryFastPath('my position') as FastPathMatch;
      expect(result.action).toBe('CHECK_USER_PNL');
    });

    it('action verbs override everything', () => {
      // "portfolio" matches PNL but "sell" is an action verb
      expect(tryFastPath('sell everything in my portfolio')).toBe(null);
    });
  });
});
