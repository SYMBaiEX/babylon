/**
 * NPC Group Dynamics Service
 * 
 * Manages continuous NPC group chat dynamics:
 * - Form new groups based on relationships
 * - NPCs join existing groups
 * - NPCs leave groups
 * - NPCs kick members from their groups
 * - NPCs invite users to their groups
 * 
 * Runs on game ticks to keep groups active and dynamic.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateSnowflakeId } from '@/lib/snowflake';

export interface GroupDynamicsResult {
  groupsCreated: number;
  membersAdded: number;
  membersRemoved: number;
  usersInvited: number;
  usersKicked: number;
}

export class NPCGroupDynamicsService {
  // Probabilities for actions per tick
  private static readonly FORM_NEW_GROUP_CHANCE = 0.05; // 5% chance per NPC
  private static readonly JOIN_GROUP_CHANCE = 0.10; // 10% chance if eligible
  private static readonly LEAVE_GROUP_CHANCE = 0.02; // 2% chance per membership
  private static readonly KICK_INACTIVE_CHANCE = 0.15; // 15% chance to sweep
  
  // Group size limits
  private static readonly MIN_GROUP_SIZE = 3;
  private static readonly MAX_GROUP_SIZE = 12;
  private static readonly IDEAL_GROUP_SIZE = 7;

  /**
   * Process all NPC group dynamics for one tick
   */
  static async processTickDynamics(): Promise<GroupDynamicsResult> {
    const startTime = Date.now();
    const result: GroupDynamicsResult = {
      groupsCreated: 0,
      membersAdded: 0,
      membersRemoved: 0,
      usersInvited: 0,
      usersKicked: 0,
    };

    try {
      logger.info('Processing NPC group dynamics', undefined, 'NPCGroupDynamicsService');

      // 1. Form new groups
      const newGroups = await this.formNewGroups();
      result.groupsCreated = newGroups;

      // 2. NPCs join existing groups
      const joins = await this.processGroupJoins();
      result.membersAdded = joins;

      // 3. NPCs leave groups
      const leaves = await this.processGroupLeaves();
      result.membersRemoved = leaves;

      // 4. Kick inactive users from groups
      const kicks = await this.kickInactiveUsers();
      result.usersKicked = kicks;

      const duration = Date.now() - startTime;
      logger.info('NPC group dynamics complete', { ...result, duration }, 'NPCGroupDynamicsService');

      return result;
    } catch (error) {
      logger.error('Error in NPC group dynamics', { error }, 'NPCGroupDynamicsService');
      return result;
    }
  }

  /**
   * Form new NPC groups based on relationships
   */
  private static async formNewGroups(): Promise<number> {
    let groupsCreated = 0;

    try {
      // Get NPCs who could start a group
      const npcs = await prisma.actor.findMany({
        where: {
          hasPool: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

      for (const npc of npcs) {
        // Random chance to form a group
        if (Math.random() > this.FORM_NEW_GROUP_CHANCE) {
          continue;
        }

        // Check if NPC already has a group they admin
        const existingGroup = await prisma.chat.findFirst({
          where: {
            name: {
              contains: npc.name,
            },
            isGroup: true,
          },
        });

        if (existingGroup) {
          continue; // Already has a group
        }

        // Get NPC's positive relationships
        const relationships = await prisma.actorRelationship.findMany({
          where: {
            OR: [
              { actor1Id: npc.id },
              { actor2Id: npc.id },
            ],
            sentiment: {
              gte: 0.5, // Positive relationships
            },
          },
          take: this.IDEAL_GROUP_SIZE - 1, // -1 for the admin
        });

        const memberIds = new Set<string>([npc.id]);

        // Add related actors as members
        for (const rel of relationships) {
          const memberId = rel.actor1Id === npc.id ? rel.actor2Id : rel.actor1Id;
          memberIds.add(memberId);
        }

        if (memberIds.size < this.MIN_GROUP_SIZE) {
          continue; // Not enough members
        }

        // Create the group chat
        const chatId = generateSnowflakeId();
        const chatName = `${npc.name}'s Circle`;

        await prisma.chat.create({
          data: {
            id: chatId,
            name: chatName,
            isGroup: true,
            updatedAt: new Date(),
            ChatParticipant: {
              create: Array.from(memberIds).map(memberId => ({
                id: generateSnowflakeId(),
                userId: memberId,
              })),
            },
          },
        });

        groupsCreated++;
        logger.info(`NPC formed new group`, {
          npcId: npc.id,
          npcName: npc.name,
          chatName,
          memberCount: memberIds.size,
        }, 'NPCGroupDynamicsService');
      }
    } catch (error) {
      logger.error('Error forming new groups', { error }, 'NPCGroupDynamicsService');
    }

    return groupsCreated;
  }

  /**
   * Process NPCs joining existing groups
   */
  private static async processGroupJoins(): Promise<number> {
    let joinsProcessed = 0;

    try {
      // Get all NPC group chats
      const groups = await prisma.chat.findMany({
        where: {
          isGroup: true,
        },
        include: {
          ChatParticipant: {
            select: {
              userId: true,
            },
          },
        },
      });

      for (const group of groups) {
        // Don't add to full groups
        if (group.ChatParticipant.length >= this.MAX_GROUP_SIZE) {
          continue;
        }

        const currentMemberIds = new Set(group.ChatParticipant.map(p => p.userId));

        // Get NPCs who could join
        const potentialMembers = await prisma.actor.findMany({
          where: {
            hasPool: true,
            id: {
              notIn: Array.from(currentMemberIds),
            },
          },
          take: 5, // Check a few candidates
        });

        for (const candidate of potentialMembers) {
          // Random chance to join
          if (Math.random() > this.JOIN_GROUP_CHANCE) {
            continue;
          }

          // Check if candidate has positive relationships with current members
          const relationships = await prisma.actorRelationship.findMany({
            where: {
              OR: [
                {
                  actor1Id: candidate.id,
                  actor2Id: {
                    in: Array.from(currentMemberIds),
                  },
                },
                {
                  actor2Id: candidate.id,
                  actor1Id: {
                    in: Array.from(currentMemberIds),
                  },
                },
              ],
              sentiment: {
                gte: 0.3, // Somewhat positive
              },
            },
          });

          // Must have at least 2 friends in the group
          if (relationships.length >= 2) {
            // Add to group
            await prisma.chatParticipant.create({
              data: {
                id: generateSnowflakeId(),
                chatId: group.id,
                userId: candidate.id,
              },
            });

            joinsProcessed++;
            logger.info(`NPC joined group`, {
              npcId: candidate.id,
              npcName: candidate.name,
              chatName: group.name,
              friendsInGroup: relationships.length,
            }, 'NPCGroupDynamicsService');

            break; // Only one join per group per tick
          }
        }
      }
    } catch (error) {
      logger.error('Error processing group joins', { error }, 'NPCGroupDynamicsService');
    }

    return joinsProcessed;
  }

  /**
   * Process NPCs leaving groups
   */
  private static async processGroupLeaves(): Promise<number> {
    let leavesProcessed = 0;

    try {
      // Get all NPC group memberships
      const memberships = await prisma.chatParticipant.findMany({
        where: {
          Chat: {
            isGroup: true,
          },
        },
        include: {
          Chat: {
            include: {
              ChatParticipant: true,
            },
          },
        },
      });

      for (const membership of memberships) {
        // Don't leave if group would become too small
        if (membership.Chat.ChatParticipant.length <= this.MIN_GROUP_SIZE) {
          continue;
        }

        // Random chance to leave
        if (Math.random() > this.LEAVE_GROUP_CHANCE) {
          continue;
        }

        // Check if NPC is the group creator (don't leave own group)
        if (membership.Chat.name?.includes(membership.userId)) {
          continue;
        }

        // Check if NPC has negative relationships with members
        const memberIds = membership.Chat.ChatParticipant
          .map(p => p.userId)
          .filter(id => id !== membership.userId);

        const negativeRelationships = await prisma.actorRelationship.findMany({
          where: {
            OR: [
              {
                actor1Id: membership.userId,
                actor2Id: {
                  in: memberIds,
                },
              },
              {
                actor2Id: membership.userId,
                actor1Id: {
                  in: memberIds,
                },
              },
            ],
            sentiment: {
              lt: -0.3, // Negative
            },
          },
        });

        // Leave if too many enemies in group
        if (negativeRelationships.length >= 2) {
          await prisma.chatParticipant.delete({
            where: {
              id: membership.id,
            },
          });

          leavesProcessed++;
          logger.info(`NPC left group`, {
            npcId: membership.userId,
            chatName: membership.Chat.name,
            reason: `${negativeRelationships.length} negative relationships`,
          }, 'NPCGroupDynamicsService');
        }
      }
    } catch (error) {
      logger.error('Error processing group leaves', { error }, 'NPCGroupDynamicsService');
    }

    return leavesProcessed;
  }

  /**
   * Kick inactive users from NPC groups
   */
  private static async kickInactiveUsers(): Promise<number> {
    let usersKicked = 0;

    try {
      // Get groups with inactive user members
      const memberships = await prisma.groupChatMembership.findMany({
        where: {
          isActive: true,
          lastMessageAt: {
            lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days inactive
          },
        },
      });

      for (const membership of memberships) {
        // Check if user is a real user (not NPC)
        const user = await prisma.user.findUnique({
          where: { id: membership.userId },
          select: {
            id: true,
            isActor: true,
          },
        });

        // Only kick real users, not NPCs
        if (user && !user.isActor) {
          // Random chance to kick
          if (Math.random() < this.KICK_INACTIVE_CHANCE) {
            // Deactivate membership
            await prisma.groupChatMembership.update({
              where: {
                id: membership.id,
              },
              data: {
                isActive: false,
                removedAt: new Date(),
                sweepReason: 'Inactive for 7+ days',
              },
            });

            // Remove from chat participants
            await prisma.chatParticipant.deleteMany({
              where: {
                chatId: membership.chatId,
                userId: membership.userId,
              },
            });

            usersKicked++;
            logger.info(`User kicked from NPC group`, {
              userId: membership.userId,
              chatId: membership.chatId,
              reason: 'Inactive for 7+ days',
            }, 'NPCGroupDynamicsService');
          }
        }
      }
    } catch (error) {
      logger.error('Error kicking inactive users', { error }, 'NPCGroupDynamicsService');
    }

    return usersKicked;
  }

  /**
   * Get group dynamics statistics
   */
  static async getGroupStats(): Promise<{
    totalGroups: number;
    activeGroups: number;
    totalMembers: number;
    avgGroupSize: number;
  }> {
    const [totalGroups, groups] = await Promise.all([
      prisma.chat.count({
        where: { isGroup: true },
      }),
      prisma.chat.findMany({
        where: { isGroup: true },
        include: {
          ChatParticipant: true,
        },
      }),
    ]);

    const activeGroups = groups.filter(g => g.ChatParticipant.length >= this.MIN_GROUP_SIZE).length;
    const totalMembers = groups.reduce((sum, g) => sum + g.ChatParticipant.length, 0);
    const avgGroupSize = groups.length > 0 ? totalMembers / groups.length : 0;

    return {
      totalGroups,
      activeGroups,
      totalMembers,
      avgGroupSize,
    };
  }
}

