/**
 * Unit Tests for coordinatorTeamMembersProvider
 *
 * Tests the TEAM_MEMBERS provider which fetches chat participants and
 * formats them with agent IDs so the coordinator LLM can identify
 * agents for DISPATCH_TO_AGENT actions.
 *
 * Coverage:
 * - Returns empty/zero-count when teamChatId is absent from state
 * - Returns "no members" shape when DB returns empty array
 * - Agent ID [id: <uuid>] appears in formatted text
 * - Human owner formatted without [id:] tag
 * - Agent count and member count are correct
 * - Agents without username fall back to displayName
 * - hasTeamMembers flag set correctly in values
 * - data.teamMembers contains structured objects (not raw strings)
 * - Multiple agents all receive IDs in text
 * - Owner without username uses display name (no @handle)
 * - No-agents case emits suggestion to create one
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';

// ─── DB mock ──────────────────────────────────────────────────────────────────
// The provider calls: db.select(...).from(...).innerJoin(...).where(...)

const mockDbQuery = mock<() => Promise<unknown[]>>(async () => []);

const mockDbChain = {
  from: mock(() => ({
    innerJoin: mock(() => ({
      where: mockDbQuery,
    })),
  })),
};

const mockDbSelect = mock(() => mockDbChain);

mock.module('@babylon/db', () => ({
  db: { select: mockDbSelect },
  chatParticipants: {
    chatId: 'cp.chatId',
    userId: 'cp.userId',
    isActive: 'cp.isActive',
  },
  users: {
    id: 'u.id',
    displayName: 'u.displayName',
    username: 'u.username',
    isAgent: 'u.isAgent',
  },
  // Stub tables used by other modules loaded in the same process (prevents cross-contamination)
  messages: {
    id: 'messages.id',
    chatId: 'messages.chatId',
    senderId: 'messages.senderId',
  },
  userAgentConfigs: { userId: 'userAgentConfigs.userId' },
  eq: (_a: unknown, _b: unknown) => ({ type: 'eq' }),
  and: (..._args: unknown[]) => ({ type: 'and' }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

const { coordinatorTeamMembersProvider } = await import(
  '../../../agents/src/plugins/plugin-user-core/src/providers/team-members'
);

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEAM_CHAT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AGENT_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_ID_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OWNER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const buildState = (teamChatId?: string): State =>
  ({
    values: { teamChatId },
    data: {},
  }) as unknown as State;

const MOCK_RUNTIME = {} as IAgentRuntime;
const MOCK_MESSAGE = {} as Memory;

type Participant = {
  id: string;
  displayName: string | null;
  username: string | null;
  isAgent: boolean;
};

const MOCK_OWNER: Participant = {
  id: OWNER_ID,
  displayName: 'Alice Smith',
  username: 'alice',
  isAgent: false,
};

const MOCK_AGENT_1: Participant = {
  id: AGENT_ID_1,
  displayName: 'Trading Bot',
  username: 'trading_bot',
  isAgent: true,
};

const MOCK_AGENT_2: Participant = {
  id: AGENT_ID_2,
  displayName: 'Social Bot',
  username: 'social_bot',
  isAgent: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupDbResult(participants: Participant[]) {
  mockDbQuery.mockResolvedValue(participants);
}

beforeEach(() => {
  mockDbSelect.mockClear();
  mockDbQuery.mockClear();
  mockDbQuery.mockResolvedValue([]);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('coordinatorTeamMembersProvider', () => {
  // ── Missing teamChatId ──────────────────────────────────────────────────

  describe('when teamChatId is absent', () => {
    it('returns empty teamMembers array without hitting the DB', async () => {
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(undefined)
      );

      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(result.data!.teamMembers).toEqual([]);
    });

    it('returns memberCount=0 and agentCount=0', async () => {
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(undefined)
      );

      expect(result.values!.memberCount).toBe(0);
      expect(result.values!.agentCount).toBe(0);
    });

    it('returns hasTeamMembers=false', async () => {
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(undefined)
      );

      expect(result.values!.hasTeamMembers).toBe(false);
    });

    it('returns empty string text', async () => {
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(undefined)
      );

      expect(result.text).toBe('');
    });
  });

  // ── Empty participant list ───────────────────────────────────────────────

  describe('when DB returns no participants', () => {
    it('returns teamMembers empty array', async () => {
      setupDbResult([]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.data!.teamMembers).toEqual([]);
    });

    it('sets hasTeamMembers=false when no participants', async () => {
      setupDbResult([]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.values!.hasTeamMembers).toBe(false);
    });

    it('includes "No team members found" in text when no participants', async () => {
      setupDbResult([]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('No team members found');
    });
  });

  // ── Agent ID in formatted text ──────────────────────────────────────────

  describe('agent IDs in formatted text', () => {
    it('includes [id: <agentId>] for each agent', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain(`[id: ${AGENT_ID_1}]`);
    });

    it('includes [id:] for all agents when multiple agents', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1, MOCK_AGENT_2]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain(`[id: ${AGENT_ID_1}]`);
      expect(result.text).toContain(`[id: ${AGENT_ID_2}]`);
    });

    it('does NOT include [id:] for the human owner', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      // Owner ID should not appear with [id:] prefix
      expect(result.text).not.toContain(`[id: ${OWNER_ID}]`);
    });

    it('includes "Available for tasks" label for agents', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('Available for tasks');
    });
  });

  // ── Owner formatting ────────────────────────────────────────────────────

  describe('owner formatting', () => {
    it('shows owner with @handle when username is present', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('Alice Smith');
      expect(result.text).toContain('@alice');
    });

    it('shows owner by displayName only when username is null', async () => {
      setupDbResult([{ ...MOCK_OWNER, username: null }, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('Alice Smith');
      expect(result.text).not.toContain('@null');
    });

    it('falls back to "User" when both username and displayName are null', async () => {
      setupDbResult([
        { ...MOCK_OWNER, username: null, displayName: null },
        MOCK_AGENT_1,
      ]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('User');
    });
  });

  // ── Agent formatting edge cases ─────────────────────────────────────────

  describe('agent formatting edge cases', () => {
    it('falls back to username as name when displayName is null', async () => {
      setupDbResult([MOCK_OWNER, { ...MOCK_AGENT_1, displayName: null }]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      // username becomes the name
      expect(result.text).toContain('trading_bot');
    });

    it('falls back to "Unknown" when both displayName and username are null', async () => {
      setupDbResult([
        MOCK_OWNER,
        { ...MOCK_AGENT_1, displayName: null, username: null },
      ]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('Unknown');
    });

    it('does not include @handle for agent when username is null', async () => {
      setupDbResult([MOCK_OWNER, { ...MOCK_AGENT_1, username: null }]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      // No @null or @undefined in text
      expect(result.text).not.toContain('@null');
      expect(result.text).not.toContain('@undefined');
    });

    it('still includes [id:] even when agent has no username', async () => {
      setupDbResult([MOCK_OWNER, { ...MOCK_AGENT_1, username: null }]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      // ID must be present even without username
      expect(result.text).toContain(`[id: ${AGENT_ID_1}]`);
    });
  });

  // ── Counts ──────────────────────────────────────────────────────────────

  describe('member and agent counts', () => {
    it('memberCount equals total participants (owner + agents)', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1, MOCK_AGENT_2]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.values!.memberCount).toBe(3);
    });

    it('agentCount counts only agents (not owner)', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1, MOCK_AGENT_2]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.values!.agentCount).toBe(2);
    });

    it('agentCount is 0 when no agents exist', async () => {
      setupDbResult([MOCK_OWNER]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.values!.agentCount).toBe(0);
    });

    it('shows "No agents created yet" suggestion when owner exists but no agents', async () => {
      setupDbResult([MOCK_OWNER]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toContain('No agents');
    });
  });

  // ── data.teamMembers structure ──────────────────────────────────────────

  describe('data.teamMembers structured list', () => {
    it('contains objects with id, displayName, username, isAgent', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      const members = result.data!.teamMembers as Array<{
        id: string;
        displayName: string | null;
        username: string | null;
        isAgent: boolean;
      }>;

      expect(members.length).toBe(2);

      const owner = members.find((m) => !m.isAgent)!;
      expect(owner.id).toBe(OWNER_ID);
      expect(owner.username).toBe('alice');
      expect(owner.isAgent).toBe(false);

      const agent = members.find((m) => m.isAgent)!;
      expect(agent.id).toBe(AGENT_ID_1);
      expect(agent.username).toBe('trading_bot');
      expect(agent.isAgent).toBe(true);
    });

    it('data.teamMembers allows validate() to see agent members', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      const members = result.data!.teamMembers as Array<{ isAgent: boolean }>;
      const hasAgent = members.some((m) => m.isAgent);
      expect(hasAgent).toBe(true);
    });
  });

  // ── hasTeamMembers flag ─────────────────────────────────────────────────

  describe('hasTeamMembers values flag', () => {
    it('is true when participants exist', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.values!.hasTeamMembers).toBe(true);
    });

    it('is false when no participants returned by DB', async () => {
      setupDbResult([]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.values!.hasTeamMembers).toBe(false);
    });

    it('is false when state has no teamChatId', async () => {
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(undefined)
      );

      expect(result.values!.hasTeamMembers).toBe(false);
    });
  });

  // ── text vs values.teamMembers consistency ──────────────────────────────

  describe('text and values.teamMembers consistency', () => {
    it('text and values.teamMembers contain the same content', async () => {
      setupDbResult([MOCK_OWNER, MOCK_AGENT_1]);
      const result = await coordinatorTeamMembersProvider.get(
        MOCK_RUNTIME,
        MOCK_MESSAGE,
        buildState(TEAM_CHAT_ID)
      );

      expect(result.text).toBe(result.values!.teamMembers as string);
    });
  });
});
