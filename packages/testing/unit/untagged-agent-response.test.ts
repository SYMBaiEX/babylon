/**
 * Untagged Agent Response Unit Tests
 *
 * Tests the ordering and capping logic for when users send messages
 * without @mentioning specific agents (all agents should respond).
 */

import { describe, expect, test } from 'bun:test';
import {
  type AgentOrderingStrategy,
  orderAgentIds,
  shuffleArray,
} from '@babylon/agents';

describe('orderAgentIds', () => {
  const baseDate = new Date('2025-01-01T00:00:00.000Z');

  const teamAgents = [
    {
      id: 'agent-1',
      displayName: 'Charlie',
      createdAt: new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000), // Day 3
    },
    {
      id: 'agent-2',
      displayName: 'Alpha',
      createdAt: new Date(baseDate.getTime()), // Day 1
    },
    {
      id: 'agent-3',
      displayName: 'Bravo',
      createdAt: new Date(baseDate.getTime() + 1 * 24 * 60 * 60 * 1000), // Day 2
    },
  ];

  const agentIds = ['agent-1', 'agent-2', 'agent-3'];

  describe('created_asc strategy', () => {
    test('sorts by creation date ascending (oldest first)', () => {
      const sorted = orderAgentIds(agentIds, teamAgents, 'created_asc');

      expect(sorted).toEqual(['agent-2', 'agent-3', 'agent-1']);
    });

    test('handles agents with same creation time', () => {
      const sameTimeAgents = [
        { id: 'a', displayName: 'A', createdAt: baseDate },
        { id: 'b', displayName: 'B', createdAt: baseDate },
      ];

      const sorted = orderAgentIds(['a', 'b'], sameTimeAgents, 'created_asc');

      expect(sorted.length).toBe(2);
      expect(sorted).toContain('a');
      expect(sorted).toContain('b');
    });

    test('handles null createdAt (treats as epoch 0)', () => {
      const agentsWithNull = [
        { id: 'a', displayName: 'A', createdAt: null },
        { id: 'b', displayName: 'B', createdAt: baseDate },
      ];

      const sorted = orderAgentIds(['a', 'b'], agentsWithNull, 'created_asc');

      expect(sorted[0]).toBe('a'); // null treated as epoch 0 (oldest)
      expect(sorted[1]).toBe('b');
    });
  });

  describe('created_desc strategy', () => {
    test('sorts by creation date descending (newest first)', () => {
      const sorted = orderAgentIds(agentIds, teamAgents, 'created_desc');

      expect(sorted).toEqual(['agent-1', 'agent-3', 'agent-2']);
    });
  });

  describe('alphabetical strategy', () => {
    test('sorts by display name alphabetically', () => {
      const sorted = orderAgentIds(agentIds, teamAgents, 'alphabetical');

      expect(sorted).toEqual(['agent-2', 'agent-3', 'agent-1']); // Alpha, Bravo, Charlie
    });

    test('handles null displayName (treats as empty string)', () => {
      const agentsWithNull = [
        { id: 'a', displayName: null, createdAt: baseDate },
        { id: 'b', displayName: 'Beta', createdAt: baseDate },
      ];

      const sorted = orderAgentIds(['a', 'b'], agentsWithNull, 'alphabetical');

      expect(sorted[0]).toBe('a'); // Empty string comes before 'Beta'
      expect(sorted[1]).toBe('b');
    });

    test('case insensitive sorting', () => {
      const mixedCaseAgents = [
        { id: 'a', displayName: 'alpha', createdAt: baseDate },
        { id: 'b', displayName: 'Beta', createdAt: baseDate },
        { id: 'c', displayName: 'CHARLIE', createdAt: baseDate },
      ];

      const sorted = orderAgentIds(
        ['a', 'b', 'c'],
        mixedCaseAgents,
        'alphabetical'
      );

      // localeCompare is case-insensitive by default in most locales
      expect(sorted[0]).toBe('a');
      expect(sorted[1]).toBe('b');
      expect(sorted[2]).toBe('c');
    });

    test('handles unicode names', () => {
      const unicodeAgents = [
        { id: 'a', displayName: '日本語', createdAt: baseDate },
        { id: 'b', displayName: 'Beta', createdAt: baseDate },
        { id: 'c', displayName: 'Алфа', createdAt: baseDate },
      ];

      const sorted = orderAgentIds(
        ['a', 'b', 'c'],
        unicodeAgents,
        'alphabetical'
      );

      // Should not throw, order depends on locale
      expect(sorted.length).toBe(3);
    });
  });

  describe('random strategy', () => {
    test('returns all agents', () => {
      const sorted = orderAgentIds(agentIds, teamAgents, 'random');

      expect(sorted.length).toBe(3);
      expect(sorted).toContain('agent-1');
      expect(sorted).toContain('agent-2');
      expect(sorted).toContain('agent-3');
    });

    test('does not modify original array', () => {
      const original = [...agentIds];
      orderAgentIds(agentIds, teamAgents, 'random');

      expect(agentIds).toEqual(original);
    });

    test('produces different orders over multiple calls (probabilistic)', () => {
      // Run multiple times and check if we ever get a different order
      const orders = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const sorted = orderAgentIds(agentIds, teamAgents, 'random');
        orders.add(sorted.join(','));
      }

      // With 3 elements, there are 6 possible orders
      // After 20 tries, we should see more than 1 order (very high probability)
      // This is a probabilistic test, but 20 tries with 3 elements should almost always work
      expect(orders.size).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {
    test('handles empty array', () => {
      const sorted = orderAgentIds([], [], 'alphabetical');
      expect(sorted).toEqual([]);
    });

    test('handles single agent', () => {
      const sorted = orderAgentIds(
        ['agent-1'],
        [teamAgents[0]!],
        'alphabetical'
      );
      expect(sorted).toEqual(['agent-1']);
    });

    test('handles unknown strategy as pass-through', () => {
      const sorted = orderAgentIds(
        agentIds,
        teamAgents,
        'unknown' as AgentOrderingStrategy
      );
      expect(sorted).toEqual(agentIds);
    });

    test('handles agent ID not in teamAgents map', () => {
      const sorted = orderAgentIds(
        ['unknown-agent'],
        teamAgents,
        'alphabetical'
      );
      expect(sorted).toEqual(['unknown-agent']);
    });
  });
});

describe('Fisher-Yates Shuffle', () => {
  test('maintains array length', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray([...arr]);
    expect(shuffled.length).toBe(5);
  });

  test('contains same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray([...arr]);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('handles empty array', () => {
    const shuffled = shuffleArray([]);
    expect(shuffled).toEqual([]);
  });

  test('handles single element', () => {
    const shuffled = shuffleArray([1]);
    expect(shuffled).toEqual([1]);
  });

  test('handles two elements', () => {
    const arr = [1, 2];
    const shuffled = shuffleArray([...arr]);
    expect(shuffled.length).toBe(2);
    expect(shuffled).toContain(1);
    expect(shuffled).toContain(2);
  });
});

describe('maxAgents Capping', () => {
  /**
   * Test the maxAgents configuration that limits how many agents respond
   * to untagged messages.
   */

  function applyMaxAgentsCap(
    agentIds: string[],
    maxAgents: number | null
  ): string[] {
    if (maxAgents === null || agentIds.length <= maxAgents) {
      return agentIds;
    }
    return agentIds.slice(0, maxAgents);
  }

  test('null maxAgents returns all agents', () => {
    const agents = ['a', 'b', 'c', 'd', 'e'];
    const capped = applyMaxAgentsCap(agents, null);
    expect(capped).toEqual(agents);
    expect(capped.length).toBe(5);
  });

  test('maxAgents of 3 returns first 3 agents', () => {
    const agents = ['a', 'b', 'c', 'd', 'e'];
    const capped = applyMaxAgentsCap(agents, 3);
    expect(capped).toEqual(['a', 'b', 'c']);
    expect(capped.length).toBe(3);
  });

  test('maxAgents larger than array returns all', () => {
    const agents = ['a', 'b'];
    const capped = applyMaxAgentsCap(agents, 10);
    expect(capped).toEqual(['a', 'b']);
    expect(capped.length).toBe(2);
  });

  test('maxAgents of 1 returns only first agent', () => {
    const agents = ['a', 'b', 'c'];
    const capped = applyMaxAgentsCap(agents, 1);
    expect(capped).toEqual(['a']);
  });

  test('maxAgents of 0 returns empty array', () => {
    const agents = ['a', 'b', 'c'];
    const capped = applyMaxAgentsCap(agents, 0);
    expect(capped).toEqual([]);
  });

  test('empty array with maxAgents returns empty', () => {
    const capped = applyMaxAgentsCap([], 5);
    expect(capped).toEqual([]);
  });
});
