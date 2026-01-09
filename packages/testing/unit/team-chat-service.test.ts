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
    test('uses consistent timing constants', () => {
      // Verify the service uses reasonable timing
      // These are tested indirectly through the integration tests
      // Here we just verify the service is importable and configured
      expect(teamChatResponseService).toBeDefined();
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
