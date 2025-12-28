/**
 * Tiered Group Service
 *
 * Manages NPC group tiers for scalable access to the asymmetric information mechanic.
 * Uses the unified Group/GroupMember schema.
 *
 * Each NPC can have 3 tier groups:
 * - Tier 1 (Inner Circle): 12 members, full alpha
 * - Tier 2 (Community): 50 members, partial alpha
 * - Tier 3 (Followers): 500 members, public content
 */

import {
  and,
  chatParticipants,
  chats,
  count,
  db,
  eq,
  groupMembers,
  groups,
  isNotNull,
  isNull,
  ne,
} from '@babylon/db';
import { GROUP_CONFIG, generateSnowflakeId, logger } from '@babylon/shared';

import { NPCInteractionTracker } from './npc-interaction-tracker';
import { StaticDataRegistry } from './static-data-registry';
import {
  ALL_TIERS,
  getHigherTier,
  getLowerTier,
  getTierConfig,
  getTierForEngagementScore,
  getTierGroupName,
  isEligibleForPromotion,
  shouldDemote,
  TIER_CONFIG,
  type TierLevel,
} from './tier-config';

export interface TierInfo {
  tier: TierLevel;
  groupId: string;
  chatId: string | null;
  groupName: string;
  memberCount: number;
  maxMembers: number;
  isFull: boolean;
}

export interface UserTierStatus {
  userId: string;
  npcId: string;
  currentTier: TierLevel | null;
  groupId: string | null;
  joinedAt: Date | null;
  engagementScore: number;
  eligibleTier: TierLevel | null;
  canBePromoted: boolean;
  promotionBlockedReason: string | null;
}

export class TieredGroupService {
  /**
   * Ensure all 3 tier groups exist for an NPC
   */
  static async ensureAllTiersExist(npcId: string): Promise<TierInfo[]> {
    const actor = StaticDataRegistry.getActor(npcId);
    if (!actor) {
      logger.warn(
        `Cannot create tiers for unknown NPC: ${npcId}`,
        undefined,
        'TieredGroupService'
      );
      return [];
    }

    const existingGroups = await db
      .select({
        id: groups.id,
        tier: groups.tier,
        name: groups.name,
        maxMembers: groups.maxMembers,
      })
      .from(groups)
      .where(
        and(
          eq(groups.ownerId, npcId),
          eq(groups.type, 'npc'),
          isNotNull(groups.tier)
        )
      );

    const existingTierMap = new Map(
      existingGroups
        .filter((g) => g.tier !== null)
        .map((g) => [g.tier as TierLevel, g])
    );

    const result: TierInfo[] = [];
    let parentGroupId: string | null = existingTierMap.get(1)?.id ?? null;

    for (const tier of ALL_TIERS) {
      const existing = existingTierMap.get(tier);
      const config = getTierConfig(tier);

      if (existing) {
        const [countResult] = await db
          .select({ count: count() })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, existing.id),
              eq(groupMembers.isActive, true)
            )
          );

        const memberCount = countResult?.count ?? 0;
        const maxMembers = existing.maxMembers ?? config.maxMembers;

        // Find associated chat
        const [chat] = await db
          .select({ id: chats.id })
          .from(chats)
          .where(eq(chats.groupId, existing.id))
          .limit(1);

        result.push({
          tier,
          groupId: existing.id,
          chatId: chat?.id ?? null,
          groupName: existing.name,
          memberCount,
          maxMembers,
          isFull: memberCount >= maxMembers,
        });
      } else {
        // Create new tier group
        const groupId = await generateSnowflakeId();
        const groupName = getTierGroupName(actor.name, tier);

        if (tier === 1) parentGroupId = groupId;

        await db.insert(groups).values({
          id: groupId,
          name: groupName,
          type: 'npc',
          ownerId: npcId,
          createdById: npcId,
          updatedAt: new Date(),
          tier,
          maxMembers: config.maxMembers,
          parentGroupId,
        });

        // Create associated chat
        const chatId = await generateSnowflakeId();
        await db.insert(chats).values({
          id: chatId,
          name: groupName,
          isGroup: true,
          groupId,
          updatedAt: new Date(),
        });

        // Add NPC as owner
        await db.insert(groupMembers).values({
          id: await generateSnowflakeId(),
          groupId,
          userId: npcId,
          role: 'owner',
          tier,
        });

        await db.insert(chatParticipants).values({
          id: await generateSnowflakeId(),
          chatId,
          userId: npcId,
        });

        logger.info(
          `Created tier ${tier} group for NPC`,
          { npcId, npcName: actor.name, groupId, groupName, tier },
          'TieredGroupService'
        );

        result.push({
          tier,
          groupId,
          chatId,
          groupName,
          memberCount: 1,
          maxMembers: config.maxMembers,
          isFull: false,
        });
      }
    }

    // Update parentGroupId for all tiers if needed
    if (parentGroupId) {
      await db
        .update(groups)
        .set({ parentGroupId })
        .where(
          and(
            eq(groups.ownerId, npcId),
            eq(groups.type, 'npc'),
            isNotNull(groups.tier),
            isNull(groups.parentGroupId)
          )
        );
    }

    return result;
  }

  /**
   * Get all tier groups for an NPC
   */
  static async getNpcTiers(npcId: string): Promise<TierInfo[]> {
    const tierGroups = await db
      .select({
        id: groups.id,
        tier: groups.tier,
        name: groups.name,
        maxMembers: groups.maxMembers,
      })
      .from(groups)
      .where(
        and(
          eq(groups.ownerId, npcId),
          eq(groups.type, 'npc'),
          isNotNull(groups.tier)
        )
      );

    const result: TierInfo[] = [];

    for (const g of tierGroups) {
      const [countResult] = await db
        .select({ count: count() })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, g.id), eq(groupMembers.isActive, true))
        );

      const [chat] = await db
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.groupId, g.id))
        .limit(1);

      const config = getTierConfig(g.tier as TierLevel);
      const maxMembers = g.maxMembers ?? config.maxMembers;
      const memberCount = countResult?.count ?? 0;

      result.push({
        tier: g.tier as TierLevel,
        groupId: g.id,
        chatId: chat?.id ?? null,
        groupName: g.name,
        memberCount,
        maxMembers,
        isFull: memberCount >= maxMembers,
      });
    }

    return result.sort((a, b) => a.tier - b.tier);
  }

  /**
   * Get user's tier status with an NPC
   */
  static async getUserTierStatus(
    userId: string,
    npcId: string
  ): Promise<UserTierStatus> {
    // Find active membership
    const [membership] = await db
      .select({
        groupId: groupMembers.groupId,
        tier: groupMembers.tier,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(
        and(
          eq(groupMembers.userId, userId),
          eq(groupMembers.isActive, true),
          eq(groups.ownerId, npcId),
          eq(groups.type, 'npc'),
          isNotNull(groups.tier)
        )
      )
      .limit(1);

    const interactionScore =
      await NPCInteractionTracker.calculateEngagementScore(userId, npcId);
    const engagementScore = interactionScore.engagementScore;

    const eligibleTier = getTierForEngagementScore(engagementScore);

    let canBePromoted = false;
    let promotionBlockedReason: string | null = null;

    if (membership?.tier !== null && membership?.tier !== undefined) {
      const currentTier = membership.tier as TierLevel;
      const daysInTier = Math.floor(
        (Date.now() - membership.joinedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (currentTier === 1) {
        promotionBlockedReason = 'Already at highest tier';
      } else if (
        isEligibleForPromotion(currentTier, engagementScore, daysInTier)
      ) {
        const higherTier = getHigherTier(currentTier);
        if (higherTier) {
          const tiers = await this.getNpcTiers(npcId);
          const targetTier = tiers.find((t) => t.tier === higherTier);
          if (targetTier && !targetTier.isFull) {
            canBePromoted = true;
          } else {
            promotionBlockedReason = `Tier ${higherTier} is full`;
          }
        }
      } else {
        const config = TIER_CONFIG[currentTier];
        const daysNeeded = config.promotionWaitDays - daysInTier;
        if (daysNeeded > 0) {
          promotionBlockedReason = `Need ${daysNeeded} more days in current tier`;
        } else {
          const higherTier = getHigherTier(currentTier);
          if (higherTier) {
            const needed = TIER_CONFIG[higherTier].minEngagementScore;
            promotionBlockedReason = `Need engagement score ${needed}+ (current: ${engagementScore.toFixed(0)})`;
          }
        }
      }
    }

    return {
      userId,
      npcId,
      currentTier: (membership?.tier as TierLevel) ?? null,
      groupId: membership?.groupId ?? null,
      joinedAt: membership?.joinedAt ?? null,
      engagementScore,
      eligibleTier,
      canBePromoted,
      promotionBlockedReason,
    };
  }

  /**
   * Invite user to appropriate tier based on engagement
   */
  static async inviteUserToTier(
    userId: string,
    npcId: string
  ): Promise<{ success: boolean; tier: TierLevel | null; reason: string }> {
    // Check if already in a tier with this NPC
    const [existing] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(
        and(
          eq(groupMembers.userId, userId),
          eq(groupMembers.isActive, true),
          eq(groups.ownerId, npcId),
          eq(groups.type, 'npc')
        )
      )
      .limit(1);

    if (existing) {
      return {
        success: false,
        tier: null,
        reason: 'Already in a group with this NPC',
      };
    }

    // Check group limit
    const [groupCount] = await db
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

    if ((groupCount?.count ?? 0) >= GROUP_CONFIG.MAX_ACTIVE_USER_GROUPS) {
      return {
        success: false,
        tier: null,
        reason: `At maximum of ${GROUP_CONFIG.MAX_ACTIVE_USER_GROUPS} groups`,
      };
    }

    // Get engagement score
    const interactionScore =
      await NPCInteractionTracker.calculateEngagementScore(userId, npcId);
    const engagementScore = interactionScore.engagementScore;

    // Ensure tiers exist
    await this.ensureAllTiersExist(npcId);

    // Find available tier
    const tiers = await this.getNpcTiers(npcId);
    let targetTier: TierInfo | null = null;

    for (const tier of ALL_TIERS) {
      if (engagementScore < TIER_CONFIG[tier].minEngagementScore) continue;
      const tierInfo = tiers.find((t) => t.tier === tier);
      if (tierInfo && !tierInfo.isFull) {
        targetTier = tierInfo;
        break;
      }
    }

    if (!targetTier) {
      return {
        success: false,
        tier: null,
        reason: `No available tier (score: ${engagementScore.toFixed(0)}, min: ${TIER_CONFIG[3].minEngagementScore})`,
      };
    }

    // Add to group
    await db.insert(groupMembers).values({
      id: await generateSnowflakeId(),
      groupId: targetTier.groupId,
      userId,
      role: 'member',
      addedBy: npcId,
      tier: targetTier.tier,
    });

    // Add to chat if exists
    if (targetTier.chatId) {
      await db.insert(chatParticipants).values({
        id: await generateSnowflakeId(),
        chatId: targetTier.chatId,
        userId,
        invitedBy: npcId,
      });
    }

    logger.info(
      'User invited to tier',
      {
        userId,
        npcId,
        tier: targetTier.tier,
        groupName: targetTier.groupName,
        engagementScore,
      },
      'TieredGroupService'
    );

    return {
      success: true,
      tier: targetTier.tier,
      reason: `Invited to ${targetTier.groupName}`,
    };
  }

  /**
   * Promote user to higher tier
   */
  static async promoteUser(userId: string, npcId: string): Promise<boolean> {
    const status = await this.getUserTierStatus(userId, npcId);
    if (!status.currentTier || !status.groupId || !status.canBePromoted)
      return false;

    const higherTier = getHigherTier(status.currentTier);
    if (!higherTier) return false;

    const tiers = await this.getNpcTiers(npcId);
    const targetTier = tiers.find((t) => t.tier === higherTier);
    if (!targetTier || targetTier.isFull) return false;

    // Deactivate old membership
    await db
      .update(groupMembers)
      .set({
        isActive: false,
        kickReason: `Promoted to Tier ${higherTier}`,
        kickedAt: new Date(),
      })
      .where(
        and(
          eq(groupMembers.groupId, status.groupId),
          eq(groupMembers.userId, userId)
        )
      );

    // Find and deactivate old chat participant
    const [oldChat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.groupId, status.groupId))
      .limit(1);

    if (oldChat) {
      await db
        .update(chatParticipants)
        .set({ isActive: false })
        .where(
          and(
            eq(chatParticipants.chatId, oldChat.id),
            eq(chatParticipants.userId, userId)
          )
        );
    }

    // Add to new tier
    await db.insert(groupMembers).values({
      id: await generateSnowflakeId(),
      groupId: targetTier.groupId,
      userId,
      role: 'member',
      addedBy: npcId,
      tier: higherTier,
      previousTier: status.currentTier,
      promotedAt: new Date(),
    });

    if (targetTier.chatId) {
      await db.insert(chatParticipants).values({
        id: await generateSnowflakeId(),
        chatId: targetTier.chatId,
        userId,
        invitedBy: npcId,
      });
    }

    logger.info(
      'User promoted',
      { userId, npcId, fromTier: status.currentTier, toTier: higherTier },
      'TieredGroupService'
    );

    return true;
  }

  /**
   * Process promotions for all NPC groups (run daily)
   */
  static async processAllPromotions(): Promise<number> {
    let promotions = 0;
    const actors = StaticDataRegistry.getAllActors();

    for (const actor of actors) {
      const memberships = await db
        .select({ userId: groupMembers.userId, tier: groupMembers.tier })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(
          and(
            eq(groups.ownerId, actor.id),
            eq(groups.type, 'npc'),
            eq(groupMembers.isActive, true),
            isNotNull(groupMembers.tier),
            ne(groupMembers.tier, 1)
          )
        );

      for (const m of memberships) {
        if (await this.promoteUser(m.userId, actor.id)) {
          promotions++;
        }
      }
    }

    return promotions;
  }

  /**
   * Process demotions for inactive users (run daily)
   */
  static async processAllDemotions(): Promise<number> {
    let demotions = 0;
    const actors = StaticDataRegistry.getAllActors();
    const now = Date.now();

    for (const actor of actors) {
      const memberships = await db
        .select({
          userId: groupMembers.userId,
          groupId: groupMembers.groupId,
          tier: groupMembers.tier,
          lastMessageAt: groupMembers.lastMessageAt,
          joinedAt: groupMembers.joinedAt,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(
          and(
            eq(groups.ownerId, actor.id),
            eq(groups.type, 'npc'),
            eq(groupMembers.isActive, true),
            isNotNull(groupMembers.tier)
          )
        );

      for (const m of memberships) {
        const tier = m.tier as TierLevel;
        const lastActivity = m.lastMessageAt ?? m.joinedAt;
        const daysSince = Math.floor(
          (now - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (shouldDemote(tier, daysSince)) {
          const lowerTier = getLowerTier(tier);
          const reason = `Inactive for ${daysSince} days`;

          // Deactivate current membership
          await db
            .update(groupMembers)
            .set({ isActive: false, kickReason: reason, kickedAt: new Date() })
            .where(eq(groupMembers.id, m.groupId));

          if (lowerTier) {
            // Find and add to lower tier
            const tiers = await this.getNpcTiers(actor.id);
            const targetTier = tiers.find((t) => t.tier === lowerTier);

            if (targetTier && !targetTier.isFull) {
              await db.insert(groupMembers).values({
                id: await generateSnowflakeId(),
                groupId: targetTier.groupId,
                userId: m.userId,
                role: 'member',
                tier: lowerTier,
                previousTier: tier,
                demotedAt: new Date(),
              });

              if (targetTier.chatId) {
                await db.insert(chatParticipants).values({
                  id: await generateSnowflakeId(),
                  chatId: targetTier.chatId,
                  userId: m.userId,
                });
              }
            }
          }

          demotions++;
          logger.info(
            'User demoted',
            {
              userId: m.userId,
              npcId: actor.id,
              fromTier: tier,
              toTier: lowerTier,
              reason,
            },
            'TieredGroupService'
          );
        }
      }
    }

    return demotions;
  }

  /**
   * Get global tier analytics
   */
  static async getGlobalAnalytics(): Promise<{
    totalNpcs: number;
    totalGroups: number;
    totalMembers: number;
    totalCapacity: number;
    fillRate: number;
    tierBreakdown: {
      tier: TierLevel;
      members: number;
      capacity: number;
      fillRate: number;
    }[];
  }> {
    const actors = StaticDataRegistry.getAllActors();
    let totalGroups = 0;
    let totalMembers = 0;
    let totalCapacity = 0;

    const tierTotals: Record<TierLevel, { members: number; capacity: number }> =
      {
        1: { members: 0, capacity: 0 },
        2: { members: 0, capacity: 0 },
        3: { members: 0, capacity: 0 },
      };

    for (const actor of actors) {
      const tiers = await this.getNpcTiers(actor.id);
      totalGroups += tiers.length;

      for (const t of tiers) {
        totalMembers += t.memberCount;
        totalCapacity += t.maxMembers;
        tierTotals[t.tier].members += t.memberCount;
        tierTotals[t.tier].capacity += t.maxMembers;
      }
    }

    return {
      totalNpcs: actors.length,
      totalGroups,
      totalMembers,
      totalCapacity,
      fillRate: totalCapacity > 0 ? totalMembers / totalCapacity : 0,
      tierBreakdown: ALL_TIERS.map((tier) => ({
        tier,
        members: tierTotals[tier].members,
        capacity: tierTotals[tier].capacity,
        fillRate:
          tierTotals[tier].capacity > 0
            ? tierTotals[tier].members / tierTotals[tier].capacity
            : 0,
      })),
    };
  }
}
