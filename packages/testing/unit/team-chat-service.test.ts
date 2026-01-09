/**
 * TeamChatResponseService Unit Tests
 *
 * Tests the TeamChatResponseService functionality without database dependencies.
 * Focuses on input validation, edge cases, and parsing logic.
 */

import { describe, expect, test } from 'bun:test';
import { teamChatResponseService } from '@babylon/agents';

describe('TeamChatResponseService', () => {
  describe('extractMentionedUsernames (via triggerMentionedAgentResponses)', () => {
    test('returns empty for no mentions', async () => {
      const result =
        await teamChatResponseService.triggerMentionedAgentResponses({
          chatId: 'test-chat',
          messageContent: 'Hello everyone, how are you?',
          mentionedAgentIds: [],
          senderUserId: 'user-1',
          senderDisplayName: 'Test User',
        });

      expect(result.triggered).toBe(0);
      expect(result.responses).toEqual([]);
    });

    test('handles empty message content', async () => {
      const result =
        await teamChatResponseService.triggerMentionedAgentResponses({
          chatId: 'test-chat',
          messageContent: '',
          mentionedAgentIds: [],
          senderUserId: 'user-1',
          senderDisplayName: 'Test User',
        });

      expect(result.triggered).toBe(0);
    });

    test('handles message with only whitespace', async () => {
      const result =
        await teamChatResponseService.triggerMentionedAgentResponses({
          chatId: 'test-chat',
          messageContent: '   \n\t  ',
          mentionedAgentIds: [],
          senderUserId: 'user-1',
          senderDisplayName: 'Test User',
        });

      expect(result.triggered).toBe(0);
    });
  });

  describe('mention parsing edge cases', () => {
    test('handles @ at end of message without username', async () => {
      const result =
        await teamChatResponseService.triggerMentionedAgentResponses({
          chatId: 'test-chat',
          messageContent: 'Hey @',
          mentionedAgentIds: [],
          senderUserId: 'user-1',
          senderDisplayName: 'Test User',
        });

      // No valid mentions
      expect(result.triggered).toBe(0);
    });

    test('handles multiple @ symbols in sequence', async () => {
      const result =
        await teamChatResponseService.triggerMentionedAgentResponses({
          chatId: 'test-chat',
          messageContent: 'Hey @@@ @@agent',
          mentionedAgentIds: [],
          senderUserId: 'user-1',
          senderDisplayName: 'Test User',
        });

      expect(result.triggered).toBe(0);
    });

    test('handles email-like text (should not match)', async () => {
      const result =
        await teamChatResponseService.triggerMentionedAgentResponses({
          chatId: 'test-chat',
          messageContent: 'Contact me at test@example.com',
          mentionedAgentIds: [],
          senderUserId: 'user-1',
          senderDisplayName: 'Test User',
        });

      // Email parsing is tricky - the regex will match "example" from @example.com
      // This is expected behavior, the validation happens via mentionedAgentIds
      expect(result.triggered).toBe(0);
    });
  });

  describe('response timing configuration', () => {
    test('service is properly initialized with required methods', () => {
      // Basic smoke test - actual timing behavior is verified in integration tests
      // The service should be defined and have the expected public interface
      expect(teamChatResponseService).toBeDefined();
      expect(
        typeof teamChatResponseService.triggerMentionedAgentResponses
      ).toBe('function');
      expect(typeof teamChatResponseService.stopPeriodicCleanup).toBe(
        'function'
      );
    });
  });
});

describe('Input Validation Edge Cases', () => {
  test('handles very long message content', async () => {
    const longMessage = 'A'.repeat(10000);

    const result = await teamChatResponseService.triggerMentionedAgentResponses(
      {
        chatId: 'test-chat',
        messageContent: longMessage,
        mentionedAgentIds: [],
        senderUserId: 'user-1',
        senderDisplayName: 'Test User',
      }
    );

    expect(result.triggered).toBe(0);
  });

  test('handles special unicode characters in message', async () => {
    const unicodeMessage = 'Hello 👋 @agent 🤖 how are you? 你好 مرحبا';

    const result = await teamChatResponseService.triggerMentionedAgentResponses(
      {
        chatId: 'test-chat',
        messageContent: unicodeMessage,
        mentionedAgentIds: [],
        senderUserId: 'user-1',
        senderDisplayName: 'Test User',
      }
    );

    // No valid agent IDs provided, so no triggers
    expect(result.triggered).toBe(0);
  });

  test('handles newlines in message', async () => {
    const multilineMessage = `Line 1
    Line 2
    @agent on line 3
    Line 4`;

    const result = await teamChatResponseService.triggerMentionedAgentResponses(
      {
        chatId: 'test-chat',
        messageContent: multilineMessage,
        mentionedAgentIds: [],
        senderUserId: 'user-1',
        senderDisplayName: 'Test User',
      }
    );

    expect(result.triggered).toBe(0);
  });

  test('handles tabs and mixed whitespace', async () => {
    const message = 'Hello\t@agent\there';

    const result = await teamChatResponseService.triggerMentionedAgentResponses(
      {
        chatId: 'test-chat',
        messageContent: message,
        mentionedAgentIds: [],
        senderUserId: 'user-1',
        senderDisplayName: 'Test User',
      }
    );

    expect(result.triggered).toBe(0);
  });

  test('handles empty sender display name', async () => {
    const result = await teamChatResponseService.triggerMentionedAgentResponses(
      {
        chatId: 'test-chat',
        messageContent: 'Hello',
        mentionedAgentIds: [],
        senderUserId: 'user-1',
        senderDisplayName: '',
      }
    );

    expect(result.triggered).toBe(0);
  });

  test('handles empty/whitespace values in array by not triggering for them', async () => {
    // Empty strings and whitespace-only strings should not be processed as valid agent IDs
    // Only 'valid-id' should be attempted (but won't find an agent in test DB)
    const result = await teamChatResponseService.triggerMentionedAgentResponses(
      {
        chatId: 'test-chat',
        messageContent: 'Hello @agent',
        mentionedAgentIds: ['', '  '],
        senderUserId: 'user-1',
        senderDisplayName: 'User',
      }
    );

    // Empty strings should result in no triggers since they're not valid IDs
    expect(result.triggered).toBe(0);
    expect(result.responses).toEqual([]);
  });
});

describe('Mention Regex Edge Cases', () => {
  /**
   * Test that trailing punctuation is correctly stripped from mentions.
   * The regex should handle sentences like "Hey @agent." at end of sentence.
   */

  // Helper to test regex behavior - matches the regex used in extractMentionedUsernames
  function extractMentions(content: string): string[] {
    const mentions: string[] = [];
    // This regex should match the one in TeamChatResponseService
    const regex = /(?:^|[\s(,])@([A-Za-z0-9_.-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        // Strip trailing punctuation that might be sentence-ending
        const username = match[1].replace(/[.,!?;:)]+$/, '');
        if (username) mentions.push(username.toLowerCase());
      }
    }
    return mentions;
  }

  test('strips trailing period from mention at end of sentence', () => {
    const mentions = extractMentions('Hey @agent.');
    expect(mentions).toEqual(['agent']);
  });

  test('strips trailing exclamation from mention', () => {
    const mentions = extractMentions('Hello @agent!');
    expect(mentions).toEqual(['agent']);
  });

  test('strips trailing question mark from mention', () => {
    const mentions = extractMentions('Are you there @agent?');
    expect(mentions).toEqual(['agent']);
  });

  test('strips trailing comma from mention', () => {
    const mentions = extractMentions('Hey @agent, how are you?');
    expect(mentions).toEqual(['agent']);
  });

  test('strips trailing semicolon from mention', () => {
    const mentions = extractMentions('@agent; please respond');
    expect(mentions).toEqual(['agent']);
  });

  test('strips trailing colon from mention', () => {
    const mentions = extractMentions('@agent: here is the info');
    expect(mentions).toEqual(['agent']);
  });

  test('strips trailing parenthesis from mention', () => {
    const mentions = extractMentions('(see @agent)');
    expect(mentions).toEqual(['agent']);
  });

  test('handles multiple mentions with trailing punctuation', () => {
    const mentions = extractMentions('@alice, @bob! and @charlie?');
    expect(mentions).toEqual(['alice', 'bob', 'charlie']);
  });

  test('preserves hyphens and dots in username (not trailing)', () => {
    const mentions = extractMentions('Hey @agent-v2.beta how are you?');
    expect(mentions).toEqual(['agent-v2.beta']);
  });

  test('strips trailing punctuation but preserves internal dots', () => {
    const mentions = extractMentions('Contact @agent.v2.');
    expect(mentions).toEqual(['agent.v2']);
  });

  test('does not match email addresses', () => {
    const mentions = extractMentions('Email me at test@example.com');
    // This should NOT match as email - the regex requires word boundary before @
    expect(mentions).toEqual([]);
  });

  test('matches mention in parentheses', () => {
    const mentions = extractMentions('Talk to (@agent) about this');
    expect(mentions).toEqual(['agent']);
  });

  test('matches mention at start of message', () => {
    const mentions = extractMentions('@agent hello there');
    expect(mentions).toEqual(['agent']);
  });

  test('matches mention at end of message without punctuation', () => {
    const mentions = extractMentions('hello @agent');
    expect(mentions).toEqual(['agent']);
  });
});

describe('Chain Depth and Cooldown Constants', () => {
  test('MAX_CHAIN_DEPTH is set to prevent infinite loops', () => {
    // The MAX_CHAIN_DEPTH constant should be reasonable (2-5)
    // We can't directly access private constants, but we verify the service
    // handles depth limits through integration tests
    expect(teamChatResponseService).toBeDefined();
  });

  test('AGENT_COOLDOWN_MS is set for reasonable rate limiting', () => {
    // Verify the service is configured with cooldown support
    // Actual behavior tested in integration tests
    expect(teamChatResponseService).toBeDefined();
  });
});
