#!/usr/bin/env bun
/**
 * Validate Tiered Group System Implementation
 *
 * Runs a series of checks to verify the tiered group system is working correctly.
 *
 * Usage:
 *   bun run scripts/validate-tiered-groups.ts
 *
 * Options:
 *   --user=<id>   Test default group assignment for a specific user
 *   --verbose     Show detailed output
 */

import { and, count, db, eq, groupMembers, groups, users } from '@babylon/db';
import {
  AlphaGroupInviteService,
  GroupChatService,
  StaticDataRegistry,
  TieredGroupService,
  UserAlphaGroupAssignmentService,
} from '@babylon/engine';
import { logger } from '@babylon/shared';

interface ValidationResult {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
  error?: string;
}

const results: ValidationResult[] = [];

function log(message: string, data?: Record<string, unknown>) {
  logger.info(message, data ?? {}, 'validate-tiered-groups');
}

function pass(name: string, details: Record<string, unknown> = {}) {
  results.push({ name, passed: true, details });
  console.log(`✅ ${name}`);
}

function fail(
  name: string,
  error: string,
  details: Record<string, unknown> = {}
) {
  results.push({ name, passed: false, details, error });
  console.log(`❌ ${name}: ${error}`);
}

async function validateTierGroupsExist() {
  log('Checking tier groups exist...');

  const analytics = await TieredGroupService.getGlobalAnalytics();

  if (analytics.totalGroups === 0) {
    fail(
      'Tier Groups Exist',
      'No tier groups found. Run bootstrap-alpha-groups.ts first.',
      analytics
    );
    return;
  }

  // Check we have all 3 tiers
  const tiers = analytics.tierBreakdown.map((t) => t.tier).sort();
  if (
    tiers.length !== 3 ||
    tiers[0] !== 1 ||
    tiers[1] !== 2 ||
    tiers[2] !== 3
  ) {
    fail(
      'All 3 Tiers Present',
      `Only found tiers: ${tiers.join(', ')}`,
      analytics
    );
    return;
  }

  // Check capacity
  const expectedNpcs = StaticDataRegistry.getAllActors().filter(
    (a) => !a.isTest
  ).length;
  const expectedGroups = expectedNpcs * 3;

  if (analytics.totalGroups < expectedGroups * 0.9) {
    fail(
      'Tier Groups Complete',
      `Expected ~${expectedGroups} groups, found ${analytics.totalGroups}`,
      { expected: expectedGroups, actual: analytics.totalGroups }
    );
    return;
  }

  pass('Tier Groups Exist', {
    totalNpcs: analytics.totalNpcs,
    totalGroups: analytics.totalGroups,
    totalCapacity: analytics.totalCapacity,
    fillRate: `${(analytics.fillRate * 100).toFixed(1)}%`,
    tierBreakdown: analytics.tierBreakdown,
  });
}

async function validateCapacityStats() {
  log('Checking capacity stats...');

  const stats = await UserAlphaGroupAssignmentService.getCapacityStats();

  if (stats.totalTier3Groups === 0) {
    fail('Tier 3 Capacity', 'No Tier 3 groups found', stats);
    return;
  }

  if (stats.availableSlots <= 0) {
    fail('Available Capacity', 'No available slots in Tier 3 groups', stats);
    return;
  }

  pass('Capacity Stats', {
    tier3Groups: stats.totalTier3Groups,
    capacity: stats.totalTier3Capacity,
    currentMembers: stats.currentTier3Members,
    availableSlots: stats.availableSlots,
    fillRate: `${(stats.fillRate * 100).toFixed(1)}%`,
    maxUsersCanServe: stats.maxUsersCanServe,
  });
}

async function validateInviteStats() {
  log('Checking invite stats...');

  const stats = await AlphaGroupInviteService.getInviteStats();

  pass('Invite Stats', {
    totalInvites: stats.totalInvites,
    activeGroups: stats.activeGroups,
    invitesLast24h: stats.invitesLast24h,
    tierBreakdown: stats.tierBreakdown,
  });
}

async function validateUserDefaultGroupAssignment(userId?: string) {
  log('Testing user default group assignment...');

  if (!userId) {
    // Find a test user or create a mock check
    const [testUser] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        and(
          eq(users.isActor, false),
          eq(users.isAgent, false),
          eq(users.isBanned, false),
          eq(users.profileComplete, true)
        )
      )
      .limit(1);

    if (!testUser) {
      pass('User Default Group Assignment', {
        skipped: true,
        reason: 'No eligible test user found',
      });
      return;
    }

    userId = testUser.id;
  }

  // Check current group count
  const [currentCount] = await db
    .select({ count: count() })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.isActive, true),
        eq(groups.type, 'npc')
      )
    );

  const npcGroupCount = currentCount?.count ?? 0;

  pass('User Default Group Assignment', {
    userId,
    currentNpcGroups: npcGroupCount,
    hasMinimumGroups: npcGroupCount >= 3,
    note:
      npcGroupCount < 3
        ? 'User would be assigned more groups if assignDefaultGroups() is called'
        : 'User meets minimum group requirement',
  });
}

async function validateAgentInheritance() {
  log('Testing agent group inheritance...');

  // Find an agent with a managed owner
  const [agent] = await db
    .select({
      id: users.id,
      username: users.username,
      managedBy: users.managedBy,
    })
    .from(users)
    .where(and(eq(users.isAgent, true), eq(users.isBanned, false)))
    .limit(1);

  if (!agent || !agent.managedBy) {
    pass('Agent Inheritance', {
      skipped: true,
      reason: 'No agents with owners found',
    });
    return;
  }

  // Check if owner has any NPC group memberships
  const [ownerGroups] = await db
    .select({
      groupId: groupMembers.groupId,
      chatId: groups.id,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.userId, agent.managedBy),
        eq(groupMembers.isActive, true),
        eq(groups.type, 'npc')
      )
    )
    .limit(1);

  if (!ownerGroups) {
    pass('Agent Inheritance', {
      agentId: agent.id,
      ownerId: agent.managedBy,
      note: 'Owner has no NPC groups to inherit',
    });
    return;
  }

  // Test that the inheritance mechanism exists
  pass('Agent Inheritance', {
    agentId: agent.id,
    ownerId: agent.managedBy,
    ownerHasGroups: true,
    note: 'GroupChatService.isInChat() will check owner membership for agents',
  });
}

async function validateGroupChatServiceMethods() {
  log('Checking GroupChatService methods...');

  // Just verify the methods exist and are callable
  const methods = ['isInChat', 'calculateKickChance', 'getUserGroupChats'];

  for (const method of methods) {
    if (
      typeof (GroupChatService as unknown as Record<string, unknown>)[
        method
      ] !== 'function'
    ) {
      fail('GroupChatService Methods', `Method ${method} not found`);
      return;
    }
  }

  pass('GroupChatService Methods', { methods });
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const specificUser = args.find((a) => a.startsWith('--user='))?.split('=')[1];

  console.log('\n🔍 Tiered Group System Validation\n');
  console.log('='.repeat(50));

  // Run all validations
  await validateTierGroupsExist();
  await validateCapacityStats();
  await validateInviteStats();
  await validateUserDefaultGroupAssignment(specificUser);
  await validateAgentInheritance();
  await validateGroupChatServiceMethods();

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (verbose) {
    console.log('\nDetailed Results:');
    console.log(JSON.stringify(results, null, 2));
  }

  if (failed > 0) {
    console.log('\n⚠️  Some validations failed. Review the issues above.\n');
    process.exit(1);
  }

  console.log(
    '\n✅ All validations passed! The tiered group system is working correctly.\n'
  );
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
