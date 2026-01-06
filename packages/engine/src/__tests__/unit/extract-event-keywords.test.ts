/**
 * Tests for extractEventKeywords utility
 *
 * Verifies keyword extraction from event/question text:
 * - Price extraction ($94k, $100,000)
 * - Percentage extraction (+15%, -20%)
 * - Date extraction (January 15, Q1 2025)
 * - Symbol extraction (BTC, ETH)
 * - Entity extraction (Bitcoin, Tesla, etc.)
 * - Action extraction (crash, surge, launch)
 */

import { describe, expect, it } from 'vitest';

import { extractEventKeywords } from '../../services/lookahead-generation-service';

describe('extractEventKeywords', () => {
  describe('Price extraction', () => {
    it('should extract dollar amounts', () => {
      const keywords = extractEventKeywords('Bitcoin breaks $94,000');
      expect(keywords).toContain('$94000');
    });

    it('should extract K notation prices', () => {
      const keywords = extractEventKeywords('BTC hits 100k');
      expect(keywords).toContain('100k');
    });

    it('should extract multiple prices', () => {
      const keywords = extractEventKeywords(
        'Bitcoin went from $50,000 to $94,000'
      );
      expect(keywords).toContain('$50000');
      expect(keywords).toContain('$94000');
    });

    it('should normalize prices to lowercase without commas', () => {
      const keywords = extractEventKeywords('$100K target reached');
      expect(keywords).toContain('$100k');
    });
  });

  describe('Percentage extraction', () => {
    it('should extract positive percentages', () => {
      const keywords = extractEventKeywords('Stock up +15%');
      expect(keywords).toContain('+15%');
    });

    it('should extract negative percentages', () => {
      const keywords = extractEventKeywords('Market down -20%');
      expect(keywords).toContain('-20%');
    });

    it('should extract decimal percentages', () => {
      const keywords = extractEventKeywords('Gain of 3.5% today');
      expect(keywords).toContain('3.5%');
    });

    it('should extract unsigned percentages', () => {
      const keywords = extractEventKeywords('10% increase');
      expect(keywords).toContain('10%');
    });
  });

  describe('Date extraction', () => {
    it('should extract month and day', () => {
      const keywords = extractEventKeywords('Deadline is January 15');
      expect(keywords).toContain('january 15');
    });

    it('should extract quarter and year', () => {
      const keywords = extractEventKeywords('Expected in Q1 2025');
      expect(keywords).toContain('q1 2025');
    });

    it('should extract standalone years', () => {
      const keywords = extractEventKeywords('Predictions for 2025');
      expect(keywords).toContain('2025');
    });

    it('should normalize dates to lowercase', () => {
      const keywords = extractEventKeywords('DECEMBER 25 deadline');
      expect(keywords).toContain('december 25');
    });

    it('should handle multiple months', () => {
      const keywords = extractEventKeywords('From March 1 to April 15');
      expect(keywords).toContain('march 1');
      expect(keywords).toContain('april 15');
    });
  });

  describe('Symbol extraction', () => {
    it('should extract crypto symbols', () => {
      const keywords = extractEventKeywords('BTC and ETH rally continues');
      expect(keywords).toContain('BTC');
      expect(keywords).toContain('ETH');
    });

    it('should extract altcoin symbols', () => {
      const keywords = extractEventKeywords('SOL, DOGE, and XRP moving');
      expect(keywords).toContain('SOL');
      expect(keywords).toContain('DOGE');
      expect(keywords).toContain('XRP');
    });

    it('should uppercase symbols', () => {
      const keywords = extractEventKeywords('btc and eth');
      expect(keywords).toContain('BTC');
      expect(keywords).toContain('ETH');
    });

    it('should not extract partial matches', () => {
      // Should not contain ETH since ETHANOL doesn't have word boundary
      const result = extractEventKeywords('ETHANOL');
      expect(result).not.toContain('ETH');
    });
  });

  describe('Entity extraction', () => {
    it('should extract crypto entities', () => {
      const keywords = extractEventKeywords('Bitcoin and Ethereum are leading');
      expect(keywords).toContain('bitcoin');
      expect(keywords).toContain('ethereum');
    });

    it('should extract tech companies', () => {
      const keywords = extractEventKeywords(
        'Apple, Google, and Microsoft earnings'
      );
      expect(keywords).toContain('apple');
      expect(keywords).toContain('google');
      expect(keywords).toContain('microsoft');
    });

    it('should extract by stock ticker', () => {
      const keywords = extractEventKeywords('AAPL and MSFT beat estimates');
      expect(keywords).toContain('apple');
      expect(keywords).toContain('microsoft');
    });

    it('should extract political figures', () => {
      const keywords = extractEventKeywords('Trump and Biden debate');
      expect(keywords).toContain('trump');
      expect(keywords).toContain('biden');
    });

    it('should extract regulatory bodies', () => {
      const keywords = extractEventKeywords('SEC and Federal Reserve meeting');
      expect(keywords).toContain('sec');
      expect(keywords).toContain('federal-reserve');
    });

    it('should extract countries', () => {
      const keywords = extractEventKeywords(
        'China, Russia, and Ukraine tensions'
      );
      expect(keywords).toContain('china');
      expect(keywords).toContain('russia');
      expect(keywords).toContain('ukraine');
    });

    it('should handle alternative names', () => {
      const keywords = extractEventKeywords(
        'Meta (formerly Facebook) announces'
      );
      expect(keywords).toContain('meta');
    });

    // AI-stylized entity name tests (game-specific)
    it('should extract AI-stylized company names', () => {
      const keywords = extractEventKeywords(
        'TeslAI and NVAIDAI lead the market'
      );
      expect(keywords).toContain('tesla');
      expect(keywords).toContain('nvidia');
    });

    it('should extract OpenAGI as openai', () => {
      const keywords = extractEventKeywords(
        'OpenAGI announces SMH-5.2 Reflection'
      );
      expect(keywords).toContain('openai');
      expect(keywords).toContain('openai-model');
    });

    it('should extract EtherAIum as ethereum', () => {
      const keywords = extractEventKeywords('EtherAIum contracts run faster');
      expect(keywords).toContain('ethereum');
    });

    it('should extract AI-stylized people names', () => {
      const keywords = extractEventKeywords(
        'AIlon Musk and Jensen HuAIng discuss'
      );
      expect(keywords).toContain('elon-musk');
      expect(keywords).toContain('jensen-huang');
    });

    it('should extract FSD as tesla-fsd', () => {
      const keywords = extractEventKeywords('TeslAI FSD is 99.9% complete');
      expect(keywords).toContain('tesla');
      expect(keywords).toContain('tesla-fsd');
    });

    it('should extract model names', () => {
      const keywords = extractEventKeywords('GPT-5 and Claude-4 compete');
      expect(keywords).toContain('openai-model');
      expect(keywords).toContain('anthropic-model');
    });
  });

  describe('Action extraction', () => {
    it('should extract crash events', () => {
      const keywords = extractEventKeywords('Market crashed today');
      expect(keywords).toContain('crash');
    });

    it('should extract surge events', () => {
      const keywords = extractEventKeywords('Bitcoin surging to new highs');
      expect(keywords).toContain('surge');
    });

    it('should extract announcements', () => {
      const keywords = extractEventKeywords('Company announces new product');
      expect(keywords).toContain('announcement');
    });

    it('should extract launches', () => {
      const keywords = extractEventKeywords('Tesla launches new model');
      expect(keywords).toContain('launch');
    });

    it('should extract regulatory actions', () => {
      const keywords = extractEventKeywords('SEC approves Bitcoin ETF');
      expect(keywords).toContain('approval');
    });

    it('should extract security events', () => {
      const keywords = extractEventKeywords('Exchange hacked, funds stolen');
      expect(keywords).toContain('security-breach');
    });

    it('should extract layoffs', () => {
      const keywords = extractEventKeywords('Tech company announces layoffs');
      expect(keywords).toContain('layoffs');
    });

    it('should extract M&A events', () => {
      const keywords = extractEventKeywords(
        'Microsoft acquisition of Activision'
      );
      expect(keywords).toContain('acquisition');
    });

    it('should extract IPO events', () => {
      const keywords = extractEventKeywords('Company files for IPO');
      expect(keywords).toContain('ipo');
    });

    // New action patterns
    it('should extract unveil events', () => {
      const keywords = extractEventKeywords('OpenAGI unveils new model');
      expect(keywords).toContain('unveil');
    });

    it('should extract reveal events', () => {
      const keywords = extractEventKeywords('Company reveals product roadmap');
      expect(keywords).toContain('reveal');
    });

    it('should extract hint events', () => {
      const keywords = extractEventKeywords('NVAIDAI hints at new chip');
      expect(keywords).toContain('hint');
    });

    it('should extract claim events', () => {
      const keywords = extractEventKeywords('TeslAI claims FSD is complete');
      expect(keywords).toContain('claim');
    });

    it('should extract partnership events', () => {
      const keywords = extractEventKeywords('Companies announce partnership');
      expect(keywords).toContain('partnership');
    });

    it('should extract release events', () => {
      const keywords = extractEventKeywords('Apple releases new iPhone');
      expect(keywords).toContain('release');
    });
  });

  describe('Complex scenarios', () => {
    it('should extract from realistic market news', () => {
      const text =
        'Bitcoin breaks $94,000 as SEC approves ETF, surging +15% in Q1 2025';
      const keywords = extractEventKeywords(text);

      expect(keywords).toContain('$94000');
      expect(keywords).toContain('+15%');
      expect(keywords).toContain('q1 2025');
      expect(keywords).toContain('bitcoin');
      expect(keywords).toContain('sec');
      expect(keywords).toContain('approval');
      expect(keywords).toContain('surge');
    });

    it('should extract from tech news', () => {
      const text = 'OpenAI announces GPT-5 launch, Microsoft stock up 10%';
      const keywords = extractEventKeywords(text);

      expect(keywords).toContain('openai');
      expect(keywords).toContain('microsoft');
      expect(keywords).toContain('announcement');
      expect(keywords).toContain('launch');
      expect(keywords).toContain('10%');
    });

    it('should limit keywords to 10', () => {
      const text = `
        Bitcoin BTC Ethereum ETH Solana SOL OpenAI Apple Google Microsoft 
        Tesla Amazon Meta Nvidia Trump Biden crashes surges +50% $100k 
        January 15 Q1 2025 2026 announcement launch hack layoffs
      `;
      const keywords = extractEventKeywords(text);

      expect(keywords.length).toBeLessThanOrEqual(10);
    });

    it('should deduplicate keywords', () => {
      const text = 'Bitcoin Bitcoin BTC bitcoin BITCOIN';
      const keywords = extractEventKeywords(text);

      // Should not have duplicate bitcoin entries
      const bitcoinCount = keywords.filter(
        (k) => k.toLowerCase() === 'bitcoin'
      ).length;
      expect(bitcoinCount).toBeLessThanOrEqual(2); // 'bitcoin' entity + 'BTC' symbol
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const keywords = extractEventKeywords('');
      expect(keywords).toEqual([]);
    });

    it('should handle text with no matches', () => {
      const keywords = extractEventKeywords(
        'Hello world, nothing special here.'
      );
      expect(keywords).toEqual([]);
    });

    it('should handle special characters', () => {
      const keywords = extractEventKeywords('Price: $50,000!!! WOW!!!');
      expect(keywords).toContain('$50000');
    });

    it('should handle multiline text', () => {
      const text = `
        Breaking news:
        Bitcoin surging to $100k
        Market celebrates
      `;
      const keywords = extractEventKeywords(text);
      expect(keywords).toContain('$100k');
      expect(keywords).toContain('bitcoin');
      expect(keywords).toContain('surge');
    });
  });
});
