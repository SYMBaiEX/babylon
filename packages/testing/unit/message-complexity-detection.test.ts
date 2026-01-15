/**
 * Message Complexity Detection Unit Tests
 *
 * Tests the detectMessageComplexity function used for adaptive timing
 * in the Command Center. This function determines whether messages
 * should trigger quick, normal, or complex responses.
 */

import { describe, expect, test } from 'bun:test';
import { detectMessageComplexity } from '@babylon/agents';

describe('detectMessageComplexity', () => {
  describe('quick messages', () => {
    test('detects simple greetings as quick', () => {
      expect(detectMessageComplexity('hi')).toBe('quick');
      expect(detectMessageComplexity('hello')).toBe('quick');
      expect(detectMessageComplexity('hey')).toBe('quick');
      expect(detectMessageComplexity('gm')).toBe('quick');
      expect(detectMessageComplexity('gn')).toBe('quick');
    });

    test('detects acknowledgements as quick', () => {
      expect(detectMessageComplexity('thanks')).toBe('quick');
      expect(detectMessageComplexity('thank you')).toBe('quick');
      expect(detectMessageComplexity('ok')).toBe('quick');
      expect(detectMessageComplexity('okay')).toBe('quick');
      expect(detectMessageComplexity('sure')).toBe('quick');
      expect(detectMessageComplexity('got it')).toBe('quick');
      expect(detectMessageComplexity('understood')).toBe('quick');
    });

    test('detects simple yes/no as quick', () => {
      expect(detectMessageComplexity('yes')).toBe('quick');
      expect(detectMessageComplexity('no')).toBe('quick');
    });

    test('detects short questions as quick', () => {
      expect(detectMessageComplexity('how are you?')).toBe('quick');
      expect(detectMessageComplexity("what's up?")).toBe('quick');
      expect(detectMessageComplexity('what time is it?')).toBe('quick');
      expect(detectMessageComplexity('who is online?')).toBe('quick');
    });

    test('detects greeting variants with punctuation as quick', () => {
      expect(detectMessageComplexity('hi!')).toBe('quick');
      expect(detectMessageComplexity('hello there')).toBe('quick');
      expect(detectMessageComplexity('hey agent')).toBe('quick');
    });

    test('case insensitive detection', () => {
      expect(detectMessageComplexity('HI')).toBe('quick');
      expect(detectMessageComplexity('HELLO')).toBe('quick');
      expect(detectMessageComplexity('Thanks!')).toBe('quick');
      expect(detectMessageComplexity('OK')).toBe('quick');
    });
  });

  describe('complex messages', () => {
    test('detects analysis keywords as complex', () => {
      expect(detectMessageComplexity('analyze this data for me')).toBe(
        'complex'
      );
      expect(detectMessageComplexity('give me an analysis of the market')).toBe(
        'complex'
      );
    });

    test('detects comparison keywords as complex', () => {
      expect(detectMessageComplexity('compare these two options')).toBe(
        'complex'
      );
      expect(detectMessageComplexity('show me a comparison')).toBe('complex');
    });

    test('detects explanation keywords as complex', () => {
      expect(detectMessageComplexity('explain how this works')).toBe('complex');
      expect(detectMessageComplexity('give me an explanation')).toBe('complex');
    });

    test('detects research keywords as complex', () => {
      expect(detectMessageComplexity('research the latest trends')).toBe(
        'complex'
      );
      expect(detectMessageComplexity('investigate this issue')).toBe('complex');
    });

    test('detects strategy keywords as complex', () => {
      expect(detectMessageComplexity('what strategy should I use?')).toBe(
        'complex'
      );
      expect(detectMessageComplexity('give me a strategic plan')).toBe(
        'complex'
      );
    });

    test('detects detailed/comprehensive keywords as complex', () => {
      expect(detectMessageComplexity('give me a detailed report')).toBe(
        'complex'
      );
      expect(detectMessageComplexity('provide a comprehensive overview')).toBe(
        'complex'
      );
    });

    test('detects prediction keywords as complex', () => {
      expect(detectMessageComplexity('predict the outcome')).toBe('complex');
      expect(detectMessageComplexity('forecast the results')).toBe('complex');
    });

    test('detects summary keywords as complex', () => {
      expect(detectMessageComplexity('summarize the discussion')).toBe(
        'complex'
      );
      expect(detectMessageComplexity('give me a summary')).toBe('complex');
    });

    test('detects breakdown keywords as complex', () => {
      expect(detectMessageComplexity('break down the steps')).toBe('complex');
      expect(detectMessageComplexity('give me a breakdown')).toBe('complex');
    });

    test('detects very long messages as complex', () => {
      const longMessage = 'word '.repeat(60); // 60+ words
      expect(detectMessageComplexity(longMessage)).toBe('complex');
    });

    test('long message with 51+ words is complex', () => {
      const fiftyOneWords = Array(51).fill('word').join(' ');
      expect(detectMessageComplexity(fiftyOneWords)).toBe('complex');
    });
  });

  describe('normal messages', () => {
    test('standard requests are normal', () => {
      expect(detectMessageComplexity('what is the price of ETH')).toBe(
        'normal'
      );
      expect(detectMessageComplexity('send a message to the team')).toBe(
        'normal'
      );
      expect(detectMessageComplexity('check my balance')).toBe('normal');
    });

    test('medium length messages without keywords are normal', () => {
      expect(
        detectMessageComplexity(
          'I was thinking about what we discussed yesterday'
        )
      ).toBe('normal');
      expect(
        detectMessageComplexity(
          'Can you help me with something related to the project'
        )
      ).toBe('normal');
    });

    test('questions without quick keywords are normal', () => {
      expect(
        detectMessageComplexity('what are the current market conditions')
      ).toBe('normal');
      expect(detectMessageComplexity('where can I find more information')).toBe(
        'normal'
      );
    });

    test('50 words is still normal (boundary)', () => {
      const fiftyWords = Array(50).fill('word').join(' ');
      expect(detectMessageComplexity(fiftyWords)).toBe('normal');
    });
  });

  describe('edge cases', () => {
    test('handles empty string', () => {
      // Empty string has 0 words, no keywords, will be normal
      expect(detectMessageComplexity('')).toBe('normal');
    });

    test('handles whitespace only', () => {
      expect(detectMessageComplexity('   ')).toBe('normal');
      expect(detectMessageComplexity('\t\n')).toBe('normal');
    });

    test('handles very short messages', () => {
      expect(detectMessageComplexity('a')).toBe('normal');
      expect(detectMessageComplexity('ab')).toBe('normal');
    });

    test('handles mixed case complex keywords', () => {
      expect(detectMessageComplexity('ANALYZE this')).toBe('complex');
      expect(detectMessageComplexity('Compare THESE')).toBe('complex');
    });

    test('handles keywords within longer words', () => {
      // "analyze" inside "overanalyze" should still match
      expect(detectMessageComplexity('overanalyze the data')).toBe('complex');
    });

    test('handles special characters and numbers', () => {
      expect(detectMessageComplexity('check $ETH price @ 3pm!')).toBe('normal');
      expect(detectMessageComplexity('analyze $100k portfolio')).toBe(
        'complex'
      );
    });

    test('handles unicode characters', () => {
      expect(detectMessageComplexity('analyze 日本語 data')).toBe('complex');
      expect(detectMessageComplexity('hi 👋')).toBe('quick');
    });

    test('handles newlines in message', () => {
      // "hi\nworld" is 2 words, but doesn't match "hi " or "hi!" pattern
      // so it's classified as normal (short without question mark)
      expect(detectMessageComplexity('hi\nworld')).toBe('normal');
      expect(detectMessageComplexity('analyze\nthe\ndata')).toBe('complex');
    });

    test('quick keyword at start overrides normal classification', () => {
      // "hi there friend" starts with "hi " so should be quick
      expect(detectMessageComplexity('hi there friend')).toBe('quick');
    });

    test('complex keyword overrides short message classification', () => {
      // Even though short, "analyze" makes it complex
      expect(detectMessageComplexity('analyze it')).toBe('complex');
    });
  });

  describe('boundary conditions', () => {
    test('15 word message with question mark is quick', () => {
      const fifteenWords = Array(15).fill('word').join(' ') + '?';
      expect(detectMessageComplexity(fifteenWords)).toBe('quick');
    });

    test('16 word message with question mark is normal', () => {
      const sixteenWords = Array(16).fill('word').join(' ') + '?';
      expect(detectMessageComplexity(sixteenWords)).toBe('normal');
    });

    test('short message with complex keyword is complex', () => {
      expect(detectMessageComplexity('analyze?')).toBe('complex');
    });
  });
});
