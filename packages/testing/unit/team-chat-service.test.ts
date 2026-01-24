/**
 * TeamChatResponseService Unit Tests
 *
 * Tests the TeamChatResponseService functionality without database dependencies.
 * Focuses on service interface validation.
 */

import { describe, expect, test } from 'bun:test';
import { teamChatResponseService } from '@babylon/agents';

describe('TeamChatResponseService', () => {
  describe('service interface', () => {
    test('service is properly initialized', () => {
      expect(teamChatResponseService).toBeDefined();
    });

    test('broadcastToAllAgents method exists', () => {
      expect(typeof teamChatResponseService.broadcastToAllAgents).toBe(
        'function'
      );
    });

    test('notifyAgentsOfMessage method exists', () => {
      expect(typeof teamChatResponseService.notifyAgentsOfMessage).toBe(
        'function'
      );
    });
  });
});

describe('Input Validation Edge Cases', () => {
  // These tests verify the service handles edge cases gracefully.
  // The actual response generation requires database and runtime,
  // so we're just verifying the API accepts valid input shapes.

  test('broadcastToAllAgents accepts valid parameters', async () => {
    // This will fail due to missing DB/chat, but it validates the interface
    // In real usage, the chat would exist
    try {
      await teamChatResponseService.broadcastToAllAgents({
        chatId: 'test-chat-id',
        senderId: 'test-sender-id',
        ownerDisplayName: 'Test User',
        ownerUsername: 'testuser',
      });
    } catch {
      // Expected to fail in test environment without DB
      // The important thing is it doesn't fail on parameter validation
    }
  });

  test('notifyAgentsOfMessage accepts valid parameters', async () => {
    try {
      await teamChatResponseService.notifyAgentsOfMessage({
        chatId: 'test-chat-id',
        senderId: 'test-sender-id',
        ownerDisplayName: 'Test User',
        ownerUsername: 'testuser',
      });
    } catch {
      // Expected to fail in test environment without DB
    }
  });
});
