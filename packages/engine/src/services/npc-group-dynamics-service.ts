/**
 * NPC Group Dynamics Service
 *
 * Manages continuous NPC group chat dynamics:
 * - Form new groups based on relationships
 * - NPCs join existing groups
 * - NPCs leave groups
 * - NPCs kick members from their groups
 * - NPCs invite users to their groups
 * - NPCs post messages to groups
 *
 * Runs on game ticks to keep groups active and dynamic.
 */

import {
  actorRelationships,
  actors,
  and,
  chatParticipants,
  chats,
  count,
  db,
  desc,
  eq,
  follows,
  groupChatMemberships,
  gte,
  inArray,
  isUniqueConstraintError,
  lt,
  messages,
  notInArray,
  or,
  poolPositions,
  posts,
  reactions,
  shares,
  toDatabaseErrorType,
  userGroupInvites,
  userInteractions,
  users,
} from '@babylon/db';
import { BabylonLLMClient } from '@babylon/engine';
import { logger } from '@babylon/shared';
import {
  validateNoEmojis,
  validateNoHashtags,
  validateNoRealNames,
} from '@babylon/engine';
import { generateSnowflakeId } from '@babylon/shared';
import { generateWorldContext } from '@babylon/engine';

export interface GroupDynamicsResult {
  groupsCreated: number;
  membersAdded: number;
  membersRemoved: number;
  usersInvited: number;
  usersKicked: number;
  messagesPosted: number;
}

export class NPCGroupDynamicsService {
  // Probabilities for actions per tick
  private static readonly FORM_NEW_GROUP_CHANCE = 0.05; // 5% chance per NPC
  private static readonly JOIN_GROUP_CHANCE = 0.1; // 10% chance if eligible
  private static readonly LEAVE_GROUP_CHANCE = 0.02; // 2% chance per membership
  private static readonly POST_MESSAGE_CHANCE = 0.25; // 25% chance per active group
  private static readonly INVITE_USER_CHANCE = 0.08; // 8% chance per group with space
  private static readonly KICK_CHECK_CHANCE = 0.15; // 15% chance to check for kicks

  // Group size limits
  private static readonly MIN_GROUP_SIZE = 3;
  private static readonly MAX_GROUP_SIZE = 12;
  private static readonly IDEAL_GROUP_SIZE = 7;

  // User group participation limits (prevent unlimited accumulation)
  private static readonly MAX_ACTIVE_USER_GROUPS = 5; // Max groups a user can be in simultaneously
  private static readonly INVITE_COOLDOWN_HOURS = 4; // Hours after joining before next invite eligible

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
      messagesPosted: 0,
    };

    logger.info(
      'Processing NPC group dynamics',
      undefined,
      'NPCGroupDynamicsService'
    );

    // Initialize LLM client for message generation (excludes Wandb)
    // Wandb models should ONLY be used for agent operations, not game tick operations
    let llm: BabylonLLMClient | null = null;
    try {
      llm = BabylonLLMClient.forGameTick();
    } catch (error) {
      logger.warn(
        'Failed to initialize LLM for group dynamics',
        { error },
        'NPCGroupDynamicsService'
      );
    }

    // 1. Form new groups
    const newGroups = await NPCGroupDynamicsService.formNewGroups();
    result.groupsCreated = newGroups;

    // 2. NPCs join existing groups
    const joins = await NPCGroupDynamicsService.processGroupJoins();
    result.membersAdded = joins;

    // 3. NPCs leave groups
    const leaves = await NPCGroupDynamicsService.processGroupLeaves();
    result.membersRemoved = leaves;

    // 4. NPCs post messages to groups
    if (llm) {
      const messages = await NPCGroupDynamicsService.postGroupMessages(llm);
      result.messagesPosted = messages;
    }

    // 5. Invite users to groups
    const invites = await NPCGroupDynamicsService.inviteUsersToGroups();
    result.usersInvited = invites;

    // 6. Kick users based on weighted participation metrics
    const kicks = await NPCGroupDynamicsService.kickUsersWithWeightedLogic();
    result.usersKicked = kicks;

    const duration = Date.now() - startTime;
    logger.info(
      'NPC group dynamics complete',
      { ...result, duration },
      'NPCGroupDynamicsService'
    );

    return result;
  }

  /**
   * Form new NPC groups based on relationships
   */
  private static async formNewGroups(): Promise<number> {
    let groupsCreated = 0;

    // Get NPCs who could start a group
    const npcs = await db
      .select({
        id: actors.id,
        name: actors.name,
      })
      .from(actors);

    for (const npc of npcs) {
      // Random chance to form a group
      if (Math.random() > NPCGroupDynamicsService.FORM_NEW_GROUP_CHANCE) {
        continue;
      }

      // Check if NPC already has a group they admin by querying groups with their name
      const [hasGroup] = await db
        .select({ id: chats.id, name: chats.name })
        .from(chats)
        .where(eq(chats.isGroup, true))
        .limit(1000);

      const alreadyHasGroup = hasGroup
        ? (
            await db
              .select({ id: chats.id, name: chats.name })
              .from(chats)
              .where(eq(chats.isGroup, true))
          ).some((g) => g.name?.includes(npc.name))
        : false;

      if (alreadyHasGroup) {
        continue; // Already has a group
      }

      // Get NPC's positive relationships
      const relationships = await db
        .select()
        .from(actorRelationships)
        .where(
          and(
            or(
              eq(actorRelationships.actor1Id, npc.id),
              eq(actorRelationships.actor2Id, npc.id)
            ),
            gte(actorRelationships.sentiment, 0.5)
          )
        )
        .limit(NPCGroupDynamicsService.IDEAL_GROUP_SIZE - 1);

      const memberIds = new Set<string>([npc.id]);

      // Add related actors as members
      for (const rel of relationships) {
        const memberId = rel.actor1Id === npc.id ? rel.actor2Id : rel.actor1Id;
        memberIds.add(memberId);
      }

      if (memberIds.size < NPCGroupDynamicsService.MIN_GROUP_SIZE) {
        continue; // Not enough members
      }

      // Create the group chat
      const chatId = await generateSnowflakeId();
      const chatName = `${npc.name}'s Circle`;

      await db.insert(chats).values({
        id: chatId,
        name: chatName,
        isGroup: true,
        updatedAt: new Date(),
      });

      // Create participants
      const participantValues = await Promise.all(
        Array.from(memberIds).map(async (memberId) => ({
          id: await generateSnowflakeId(),
          chatId,
          userId: memberId,
        }))
      );
      await db.insert(chatParticipants).values(participantValues);

      groupsCreated++;
      logger.info(
        'NPC formed new group',
        {
          npcId: npc.id,
          npcName: npc.name,
          chatName,
          memberCount: memberIds.size,
        },
        'NPCGroupDynamicsService'
      );
    }

    return groupsCreated;
  }

  /**
   * Process NPCs joining existing groups
   */
  private static async processGroupJoins(): Promise<number> {
    let joinsProcessed = 0;

    // Get all NPC group chats
    const groupList = await db
      .select()
      .from(chats)
      .where(eq(chats.isGroup, true));

    for (const group of groupList) {
      // Get participants for this group
      const participants = await db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, group.id));

      // Don't add to full groups
      if (participants.length >= NPCGroupDynamicsService.MAX_GROUP_SIZE) {
        continue;
      }

      const currentMemberIds = new Set(participants.map((p) => p.userId));
      const memberIdsArray = Array.from(currentMemberIds);

      // Get NPCs who could join
      const potentialMembers =
        memberIdsArray.length > 0
          ? await db
              .select()
              .from(actors)
              .where(notInArray(actors.id, memberIdsArray))
              .limit(5)
          : await db.select().from(actors).limit(5);

      for (const candidate of potentialMembers) {
        // Random chance to join
        if (Math.random() > NPCGroupDynamicsService.JOIN_GROUP_CHANCE) {
          continue;
        }

        // Check if candidate has positive relationships with current members
        const relationships =
          memberIdsArray.length > 0
            ? await db
                .select()
                .from(actorRelationships)
                .where(
                  and(
                    or(
                      and(
                        eq(actorRelationships.actor1Id, candidate.id),
                        inArray(actorRelationships.actor2Id, memberIdsArray)
                      ),
                      and(
                        eq(actorRelationships.actor2Id, candidate.id),
                        inArray(actorRelationships.actor1Id, memberIdsArray)
                      )
                    ),
                    gte(actorRelationships.sentiment, 0.3)
                  )
                )
            : [];

        // Must have at least 2 friends in the group
        if (relationships.length >= 2) {
          // Add to group
          await db.insert(chatParticipants).values({
            id: await generateSnowflakeId(),
            chatId: group.id,
            userId: candidate.id,
          });

          joinsProcessed++;
          logger.info(
            'NPC joined group',
            {
              npcId: candidate.id,
              npcName: candidate.name,
              chatName: group.name,
              friendsInGroup: relationships.length,
            },
            'NPCGroupDynamicsService'
          );

          break; // Only one join per group per tick
        }
      }
    }

    return joinsProcessed;
  }

  /**
   * Process NPCs leaving groups
   */
  private static async processGroupLeaves(): Promise<number> {
    let leavesProcessed = 0;

    // Get all group chats
    const groupChats = await db
      .select()
      .from(chats)
      .where(eq(chats.isGroup, true));

    for (const chat of groupChats) {
      // Get all participants for this chat
      const participantList = await db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, chat.id));

      // Don't process if group would become too small
      if (participantList.length <= NPCGroupDynamicsService.MIN_GROUP_SIZE) {
        continue;
      }

      for (const membership of participantList) {
        // Random chance to leave
        if (Math.random() > NPCGroupDynamicsService.LEAVE_GROUP_CHANCE) {
          continue;
        }

        // Check if NPC is the group creator (don't leave own group)
        if (chat.name?.includes(membership.userId)) {
          continue;
        }

        // Check if NPC has negative relationships with members
        const memberIds = participantList
          .map((p) => p.userId)
          .filter((id) => id !== membership.userId);

        if (memberIds.length === 0) continue;

        const negativeRelationships = await db
          .select()
          .from(actorRelationships)
          .where(
            and(
              or(
                and(
                  eq(actorRelationships.actor1Id, membership.userId),
                  inArray(actorRelationships.actor2Id, memberIds)
                ),
                and(
                  eq(actorRelationships.actor2Id, membership.userId),
                  inArray(actorRelationships.actor1Id, memberIds)
                )
              ),
              lt(actorRelationships.sentiment, -0.3)
            )
          );

        // Leave if too many enemies in group
        if (negativeRelationships.length >= 2) {
          await db
            .delete(chatParticipants)
            .where(eq(chatParticipants.id, membership.id));

          leavesProcessed++;
          logger.info(
            'NPC left group',
            {
              npcId: membership.userId,
              chatName: chat.name,
              reason: `${negativeRelationships.length} negative relationships`,
            },
            'NPCGroupDynamicsService'
          );
        }
      }
    }

    return leavesProcessed;
  }

  /**
   * Post messages to groups from NPCs
   *
   * IMPORTANT: Group chats are the core ASYMMETRIC INFORMATION mechanic.
   * NPCs share insider info here that they would NEVER post publicly:
   * - Real positions and upcoming trades
   * - Insider knowledge about questions/markets
   * - Contradictions to their public statements
   * - Strategic coordination with allies
   */
  private static async postGroupMessages(
    llm: BabylonLLMClient
  ): Promise<number> {
    let messagesPosted = 0;

    // Get active group chats
    const groupList = await db
      .select()
      .from(chats)
      .where(eq(chats.isGroup, true))
      .limit(20);

    for (const group of groupList) {
      // Random chance to post
      if (Math.random() > NPCGroupDynamicsService.POST_MESSAGE_CHANCE) {
        continue;
      }

      // Get participants
      const participantList = await db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, group.id));

      // Get recent messages
      const recentMsgs = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, group.id))
        .orderBy(desc(messages.createdAt))
        .limit(10);

      // Get user details for participants
      const participantUserIds = participantList.map((p) => p.userId);
      const participantUsers =
        participantUserIds.length > 0
          ? await db
              .select({
                id: users.id,
                displayName: users.displayName,
                isActor: users.isActor,
              })
              .from(users)
              .where(inArray(users.id, participantUserIds))
          : [];

      // Get NPCs in this group
      const npcUsers = participantUsers.filter((u) => u.isActor);

      if (npcUsers.length === 0) {
        continue; // No NPCs in this group
      }

      // Pick a random NPC to post
      const randomNpc = npcUsers[Math.floor(Math.random() * npcUsers.length)];
      if (!randomNpc) continue;

      // Get full NPC actor data for insider context
      const [npcActor] = await db
        .select()
        .from(actors)
        .where(eq(actors.id, randomNpc.id))
        .limit(1);

      // Get NPC's current positions for insider trading context
      const npcPositions = await db
        .select()
        .from(poolPositions)
        .where(eq(poolPositions.poolId, randomNpc.id))
        .limit(5);

      // Get sender details for recent messages
      const messageSenderIds = recentMsgs.slice(0, 5).map((m) => m.senderId);
      const senders =
        messageSenderIds.length > 0
          ? await db
              .select({
                id: users.id,
                displayName: users.displayName,
              })
              .from(users)
              .where(inArray(users.id, messageSenderIds))
          : [];
      const senderMap = new Map(
        senders.map((s) => [s.id, s.displayName || 'Someone'])
      );

      // Build conversation context from recent messages
      const recentMessages = recentMsgs
        .slice(0, 5)
        .reverse()
        .map((m) => `${senderMap.get(m.senderId) || 'Someone'}: ${m.content}`)
        .join('\n');

      const conversationContext = recentMessages
        ? `Recent conversation:\n${recentMessages}`
        : '';

      // Build position context for insider trading info
      const positionContext =
        npcPositions.length > 0
          ? `YOUR CURRENT POSITIONS (share strategically):\n${npcPositions
              .map(
                (p) =>
                  `- ${p.marketType === 'perp' ? p.ticker : `Question #${p.marketId}`}: ${p.side} position, ${p.unrealizedPnL > 0 ? 'up' : 'down'} $${Math.abs(Number(p.unrealizedPnL)).toFixed(0)}`
              )
              .join('\n')}`
          : '';

      // Build affiliation context
      const affiliationContext =
        npcActor?.affiliations && npcActor.affiliations.length > 0
          ? `Your affiliations: ${npcActor.affiliations.join(', ')}`
          : '';

      try {
        // Get world context for consistent parody names and market awareness
        const worldContext = await generateWorldContext({ maxActors: 20 });

        // Generate INSIDER message - this is the key asymmetric information mechanic!
        const prompt = `You are ${randomNpc.displayName} in a PRIVATE group chat with trusted insiders.
${affiliationContext}

${conversationContext}

${positionContext}

${worldContext.worldActors}
${worldContext.currentMarkets}

This is PRIVATE - share STRATEGIC insider information that you would NEVER post publicly:

WHAT TO SHARE (pick one that's relevant):
- "Just loaded up on [ticker] before the announcement drops"
- "Between us, [company] numbers look terrible this quarter"
- "I'm hearing [rival] is in serious trouble"
- "Get out of [ticker] now - trust me on this"
- "Real talk: market is wrong about [question]"
- Your actual position and why (contradict public statements if needed)
- Insider knowledge about your affiliated organizations
- Strategic advice for friends in this group

PRIVATE vs PUBLIC:
- PUBLIC feed: What you want the market to think
- PRIVATE chat: What you actually know/believe/plan
- Help friends make money, hurt enemies

Write a private message (max 200 chars) with ACTIONABLE insider info.
Be SPECIFIC with tickers, positions, or predictions.
NO hashtags. Emojis OK (🤫 👀 🔥).
Use parody names from World Actors (AIlon Musk, not Elon Musk).

Return your response as XML:
<response>
  <message>your insider message here</message>
</response>`;

        const rawResponse = await llm.generateJSON<
          { message: string } | { response: { message: string } }
        >(
          prompt,
          {
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          },
          {
            temperature: 0.9,
            maxTokens: 100,
            promptType: 'npc_group_dynamic_message',
          }
        );

        // Handle XML structure
        const response =
          'response' in rawResponse && rawResponse.response
            ? rawResponse.response
            : (rawResponse as { message: string });

        if (!response.message || response.message.length === 0) {
          continue;
        }

        // Validate message follows rules
        const messageContent = response.message.trim();
        const realNameViolations = validateNoRealNames(messageContent);
        const hashtagViolations = validateNoHashtags(messageContent);
        const emojiViolations = validateNoEmojis(messageContent);

        if (
          realNameViolations.length > 0 ||
          hashtagViolations.length > 0 ||
          emojiViolations.length > 0
        ) {
          logger.warn(
            'NPC group message validation failed, skipping',
            {
              npcId: randomNpc.id,
              violations: [
                ...realNameViolations,
                ...hashtagViolations,
                ...emojiViolations,
              ],
              message: messageContent,
            },
            'NPCGroupDynamicsService'
          );
          continue;
        }

        // Create the message
        await db.insert(messages).values({
          id: await generateSnowflakeId(),
          content: messageContent,
          chatId: group.id,
          senderId: randomNpc.id,
          createdAt: new Date(),
        });

        // Update chat updated timestamp
        await db
          .update(chats)
          .set({ updatedAt: new Date() })
          .where(eq(chats.id, group.id));

        messagesPosted++;
        logger.debug(
          'NPC posted to group',
          {
            npcId: randomNpc.id,
            npcName: randomNpc.displayName,
            chatId: group.id,
            chatName: group.name,
          },
          'NPCGroupDynamicsService'
        );
      } catch (error) {
        logger.warn(
          'Failed to generate NPC group message',
          {
            error,
            npcId: randomNpc.id,
            chatId: group.id,
          },
          'NPCGroupDynamicsService'
        );
      }
    }

    return messagesPosted;
  }

  /**
   * Calculate "reply guy" score for a user based on their interactions with NPCs
   *
   * Rewards quality engagement, penalizes spam behavior
   *
   * Scoring:
   * - Follow: +5 points
   * - Comment: +3 points (ideal: 1-3 per week)
   * - Like: +1 point (ideal: 3-10 per week)
   * - Repost: +4 points (ideal: 1-2 per week)
   *
   * Penalties for excessive engagement (spam behavior):
   * - Too many comments (>10/week): -2 per excess comment
   * - Too many likes (>30/week): -0.5 per excess like
   * - Too many reposts (>5/week): -3 per excess repost
   */
  /**
   * Calculate engagement score for potential group invites (exposed for testing)
   */
  public static async calculateReplyGuyScore(
    userId: string,
    npcIds: string[]
  ): Promise<{
    score: number;
    breakdown: {
      follows: number;
      comments: number;
      likes: number;
      reposts: number;
      penalties: number;
      relationshipModifier: number;
      friendBoosts: number;
      enemyPenalties: number;
    };
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let score = 0;
    const breakdown = {
      follows: 0,
      comments: 0,
      likes: 0,
      reposts: 0,
      penalties: 0,
      relationshipModifier: 1.0,
      friendBoosts: 0,
      enemyPenalties: 0,
    };

    // 1. Check follows (all-time)
    const [followResult] =
      npcIds.length > 0
        ? await db
            .select({ count: count() })
            .from(follows)
            .where(
              and(
                eq(follows.followerId, userId),
                inArray(follows.followingId, npcIds)
              )
            )
        : [{ count: 0 }];
    const followCount = followResult?.count ?? 0;
    breakdown.follows = followCount * 5;
    score += breakdown.follows;

    // 2. Count comments on NPC posts (last 7 days)
    // This requires a subquery to find posts by NPCs that user commented on
    const npcPosts =
      npcIds.length > 0
        ? await db
            .select({ id: posts.id })
            .from(posts)
            .where(inArray(posts.authorId, npcIds))
        : [];
    const npcPostIds = npcPosts.map((p) => p.id);

    const [commentResult] =
      npcPostIds.length > 0
        ? await db
            .select({ count: count() })
            .from(posts)
            .where(
              and(
                eq(posts.authorId, userId),
                inArray(posts.commentOnPostId, npcPostIds),
                gte(posts.createdAt, oneWeekAgo)
              )
            )
        : [{ count: 0 }];
    const commentCount = commentResult?.count ?? 0;

    // Ideal: 1-3 comments per week
    if (commentCount >= 1 && commentCount <= 3) {
      breakdown.comments = commentCount * 3;
      score += breakdown.comments;
    } else if (commentCount > 3 && commentCount <= 10) {
      // Still okay, but diminishing returns
      breakdown.comments = commentCount * 2;
      score += breakdown.comments;
    } else if (commentCount > 10) {
      // Spam behavior - penalty
      const goodComments = 10 * 2; // First 10 get points
      const excessComments = commentCount - 10;
      const penalty = excessComments * -2;
      breakdown.comments = goodComments;
      breakdown.penalties += penalty;
      score += goodComments + penalty;
    }

    // 3. Count likes on NPC posts (last 7 days)
    const [likeResult] =
      npcPostIds.length > 0
        ? await db
            .select({ count: count() })
            .from(reactions)
            .where(
              and(
                eq(reactions.userId, userId),
                eq(reactions.type, 'like'),
                inArray(reactions.postId, npcPostIds),
                gte(reactions.createdAt, oneWeekAgo)
              )
            )
        : [{ count: 0 }];
    const likeCount = likeResult?.count ?? 0;

    // Ideal: 3-10 likes per week
    if (likeCount >= 3 && likeCount <= 10) {
      breakdown.likes = likeCount * 1;
      score += breakdown.likes;
    } else if (likeCount > 10 && likeCount <= 30) {
      // Moderate engagement
      breakdown.likes = likeCount * 0.5;
      score += breakdown.likes;
    } else if (likeCount > 30) {
      // Excessive liking - penalty
      const goodLikes = 30 * 0.5;
      const excessLikes = likeCount - 30;
      const penalty = excessLikes * -0.5;
      breakdown.likes = goodLikes;
      breakdown.penalties += penalty;
      score += goodLikes + penalty;
    } else if (likeCount > 0 && likeCount < 3) {
      // Some engagement is better than none
      breakdown.likes = likeCount * 0.5;
      score += breakdown.likes;
    }

    // 4. Count reposts/shares of NPC posts (last 7 days)
    const [repostResult] =
      npcPostIds.length > 0
        ? await db
            .select({ count: count() })
            .from(shares)
            .where(
              and(
                eq(shares.userId, userId),
                inArray(shares.postId, npcPostIds),
                gte(shares.createdAt, oneWeekAgo)
              )
            )
        : [{ count: 0 }];
    const repostCount = repostResult?.count ?? 0;

    // Ideal: 1-2 reposts per week
    if (repostCount >= 1 && repostCount <= 2) {
      breakdown.reposts = repostCount * 4;
      score += breakdown.reposts;
    } else if (repostCount > 2 && repostCount <= 5) {
      // Moderate reposting
      breakdown.reposts = repostCount * 2;
      score += breakdown.reposts;
    } else if (repostCount > 5) {
      // Excessive reposting - penalty
      const goodReposts = 5 * 2;
      const excessReposts = repostCount - 5;
      const penalty = excessReposts * -3;
      breakdown.reposts = goodReposts;
      breakdown.penalties += penalty;
      score += goodReposts + penalty;
    }

    // 5. Apply relationship modifier
    const relationshipModifier =
      await NPCGroupDynamicsService.calculateRelationshipModifier(
        userId,
        npcIds
      );
    breakdown.relationshipModifier = relationshipModifier.modifier;
    breakdown.friendBoosts = relationshipModifier.friendBoosts;
    breakdown.enemyPenalties = relationshipModifier.enemyPenalties;

    // Apply the modifier to the final score
    score = score * relationshipModifier.modifier;

    return { score, breakdown };
  }

  /**
   * Calculate relationship-based modifier for invite probability
   *
   * If user engages with friends of the candidate NPC, boost invite chance slightly
   * If user engages with enemies of the candidate NPC, reduce invite chance
   *
   * @param userId - The user being evaluated
   * @param targetNpcIds - The NPCs in the group (candidates for inviting)
   * @returns Modifier between 0.2x and 2.0x
   */
  private static async calculateRelationshipModifier(
    userId: string,
    targetNpcIds: string[]
  ): Promise<{
    modifier: number;
    friendBoosts: number;
    enemyPenalties: number;
  }> {
    let modifier = 1.0;
    let friendBoosts = 0;
    let enemyPenalties = 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get all NPCs the user has engaged with (via UserInteraction table)
    const userInteractionList = await db
      .select({ npcId: userInteractions.npcId })
      .from(userInteractions)
      .where(
        and(
          eq(userInteractions.userId, userId),
          gte(userInteractions.timestamp, thirtyDaysAgo)
        )
      );

    // Get unique NPC IDs
    const userEngagedNpcIds = [
      ...new Set(userInteractionList.map((i) => i.npcId)),
    ];

    if (userEngagedNpcIds.length === 0) {
      return { modifier: 1.0, friendBoosts: 0, enemyPenalties: 0 };
    }

    // For each target NPC (in the group), check relationships with NPCs user engages with
    for (const targetNpcId of targetNpcIds) {
      const relationships = await db
        .select()
        .from(actorRelationships)
        .where(
          or(
            and(
              eq(actorRelationships.actor1Id, targetNpcId),
              inArray(actorRelationships.actor2Id, userEngagedNpcIds)
            ),
            and(
              eq(actorRelationships.actor2Id, targetNpcId),
              inArray(actorRelationships.actor1Id, userEngagedNpcIds)
            )
          )
        );

      for (const rel of relationships) {
        // Enemy relationship: reduce invite chance
        if (rel.sentiment < -0.3) {
          modifier *= 0.8; // 20% reduction per enemy
          enemyPenalties++;
          logger.debug(
            'User engages with enemy NPC, reducing invite chance',
            {
              userId,
              targetNpcId,
              enemyNpcId:
                rel.actor1Id === targetNpcId ? rel.actor2Id : rel.actor1Id,
              sentiment: rel.sentiment,
              newModifier: modifier,
            },
            'NPCGroupDynamicsService'
          );
        }
        // Friend relationship: boost invite chance slightly
        else if (rel.sentiment > 0.5) {
          modifier *= 1.1; // 10% boost per friend
          friendBoosts++;
          logger.debug(
            'User engages with friend NPC, boosting invite chance',
            {
              userId,
              targetNpcId,
              friendNpcId:
                rel.actor1Id === targetNpcId ? rel.actor2Id : rel.actor1Id,
              sentiment: rel.sentiment,
              newModifier: modifier,
            },
            'NPCGroupDynamicsService'
          );
        }
      }
    }

    // Cap the modifier between 0.2x (80% penalty max) and 2.0x (100% boost max)
    modifier = Math.max(0.2, Math.min(2.0, modifier));

    return { modifier, friendBoosts, enemyPenalties };
  }

  /**
   * Invite users to NPC groups based on quality engagement
   *
   * Users earn invitation chances by:
   * - Following NPCs
   * - Commenting thoughtfully (not spamming)
   * - Liking posts moderately
   * - Reposting occasionally
   *
   * Excessive engagement (spam) reduces invitation likelihood
   */
  private static async inviteUsersToGroups(): Promise<number> {
    let usersInvited = 0;

    // Get groups with space for more members
    const groupList = await db
      .select()
      .from(chats)
      .where(eq(chats.isGroup, true));

    for (const group of groupList) {
      // Get participants for this group
      const participants = await db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, group.id));

      // Check if group has space
      if (participants.length >= NPCGroupDynamicsService.MAX_GROUP_SIZE) {
        continue;
      }

      // Random chance to invite
      if (Math.random() > NPCGroupDynamicsService.INVITE_USER_CHANCE) {
        continue;
      }

      const currentMemberIds = new Set(participants.map((p) => p.userId));
      const memberIdsArray = Array.from(currentMemberIds);

      // Get NPCs in this group (for scoring user interactions)
      const npcMemberIds =
        memberIdsArray.length > 0
          ? await db
              .select({ id: actors.id })
              .from(actors)
              .where(inArray(actors.id, memberIdsArray))
          : [];

      if (npcMemberIds.length === 0) {
        continue; // No NPCs in group
      }

      const npcIds = npcMemberIds.map((npc) => npc.id);

      // Get active real users (not NPCs) who aren't in this group
      // First get users who have at least one share
      const usersWithShares = await db
        .select({ userId: shares.userId })
        .from(shares);
      const userIdsWithShares = [
        ...new Set(usersWithShares.map((s) => s.userId)),
      ];

      const potentialInvites =
        userIdsWithShares.length > 0
          ? await db
              .select()
              .from(users)
              .where(
                and(
                  eq(users.isActor, false),
                  notInArray(
                    users.id,
                    memberIdsArray.length > 0 ? memberIdsArray : ['']
                  ),
                  inArray(users.id, userIdsWithShares)
                )
              )
              .limit(30)
          : [];

      if (potentialInvites.length === 0) {
        continue;
      }

      // Calculate "reply guy" scores for all candidates
      const scoredUsers = await Promise.all(
        potentialInvites.map(async (user) => {
          const { score, breakdown } =
            await NPCGroupDynamicsService.calculateReplyGuyScore(
              user.id,
              npcIds
            );
          return {
            user,
            score,
            breakdown,
          };
        })
      );

      // Filter out users with negative scores (spammers)
      let eligibleUsers = scoredUsers.filter((su) => su.score > 0);

      // Filter users at their group limit or in cooldown
      eligibleUsers =
        await NPCGroupDynamicsService.filterUsersForInvite(eligibleUsers);

      if (eligibleUsers.length === 0) {
        continue;
      }

      // Sort by score descending (best reply guys first)
      eligibleUsers.sort((a, b) => b.score - a.score);

      // Pick from top 5 candidates with weighted randomness
      // Higher scores = higher chance to be selected
      const topCandidates = eligibleUsers.slice(0, 5);
      const totalScore = topCandidates.reduce((sum, c) => sum + c.score, 0);

      if (totalScore === 0) {
        continue;
      }

      // Weighted random selection
      if (topCandidates.length === 0) continue;
      let randomValue = Math.random() * totalScore;
      let selectedCandidate = topCandidates[0];

      for (const candidate of topCandidates) {
        randomValue -= candidate.score;
        if (randomValue <= 0) {
          selectedCandidate = candidate;
          break;
        }
      }

      if (!selectedCandidate) continue;

      // Get an NPC admin from the group to send the invite
      if (npcMemberIds.length === 0) continue;
      const invitingNpc = npcMemberIds[0];
      if (!invitingNpc) continue;

      // Get full NPC data for logging
      const [npcData] = await db
        .select({ name: actors.name })
        .from(actors)
        .where(eq(actors.id, invitingNpc.id))
        .limit(1);

      // Create the invitation - handle unique constraint (user may already be invited)
      try {
        await db.insert(userGroupInvites).values({
          id: await generateSnowflakeId(),
          groupId: group.id,
          invitedUserId: selectedCandidate.user.id,
          invitedBy: invitingNpc.id,
          status: 'pending',
          message: `Join our group chat "${group.name}"!`,
          invitedAt: new Date(),
        });
        usersInvited++;
        logger.info(
          'User invited to NPC group (reply guy score)',
          {
            userId: selectedCandidate.user.id,
            userName: selectedCandidate.user.displayName,
            chatId: group.id,
            chatName: group.name,
            invitedBy: npcData?.name,
            replyGuyScore: selectedCandidate.score,
            breakdown: selectedCandidate.breakdown,
          },
          'NPCGroupDynamicsService'
        );
      } catch (error) {
        // Handle unique constraint violation - user already has an invite
        if (isUniqueConstraintError(toDatabaseErrorType(error))) {
          const pgError = error as { meta?: { target?: string[] } };
          const target = pgError.meta?.target;
          if (
            target?.includes('groupId') &&
            target?.includes('invitedUserId')
          ) {
            // User already has an invite, skip silently (this is expected in NPC dynamics)
            logger.debug(
              'User already has invite, skipping',
              {
                userId: selectedCandidate.user.id,
                groupId: group.id,
              },
              'NPCGroupDynamicsService'
            );
            continue;
          }
        }
        // Re-throw other errors
        throw error;
      }
    }

    return usersInvited;
  }

  /**
   * Filter users who are at their group limit or in invite cooldown
   * Prevents unlimited group chat accumulation
   */
  private static async filterUsersForInvite<
    T extends {
      user: { id: string };
      score: number;
      breakdown: Record<string, number | string>;
    },
  >(candidates: T[]): Promise<T[]> {
    const filtered: T[] = [];

    for (const candidate of candidates) {
      // Check 1: Total active groups limit
      const [countResult] = await db
        .select({ count: count() })
        .from(groupChatMemberships)
        .where(
          and(
            eq(groupChatMemberships.userId, candidate.user.id),
            eq(groupChatMemberships.isActive, true)
          )
        );
      const activeGroupCount = countResult?.count ?? 0;

      if (activeGroupCount >= NPCGroupDynamicsService.MAX_ACTIVE_USER_GROUPS) {
        logger.debug(
          'User at group limit, skipping invite',
          {
            userId: candidate.user.id,
            activeGroups: activeGroupCount,
            maxGroups: NPCGroupDynamicsService.MAX_ACTIVE_USER_GROUPS,
          },
          'NPCGroupDynamicsService'
        );
        continue;
      }

      // Check 2: Invite cooldown
      const [latestMembership] = await db
        .select()
        .from(groupChatMemberships)
        .where(
          and(
            eq(groupChatMemberships.userId, candidate.user.id),
            eq(groupChatMemberships.isActive, true)
          )
        )
        .orderBy(desc(groupChatMemberships.joinedAt))
        .limit(1);

      if (latestMembership) {
        const hoursSinceJoin =
          (Date.now() - latestMembership.joinedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceJoin < NPCGroupDynamicsService.INVITE_COOLDOWN_HOURS) {
          logger.debug(
            'User in invite cooldown, skipping',
            {
              userId: candidate.user.id,
              hoursSinceJoin: hoursSinceJoin.toFixed(2),
              cooldownRequired: NPCGroupDynamicsService.INVITE_COOLDOWN_HOURS,
            },
            'NPCGroupDynamicsService'
          );
          continue;
        }
      }

      // User passed all checks
      filtered.push(candidate);
    }

    return filtered;
  }

  /**
   * Calculate dynamic kick thresholds based on group activity
   *
   * Returns participation thresholds relative to group's average activity level.
   * This ensures users aren't penalized in low-activity groups or get away with
   * minimal contribution in high-activity groups.
   */
  private static calculateDynamicThresholds(
    totalMessages: number,
    participantCount: number,
    windowDays = 7
  ): {
    idealMin: number; // Minimum messages for good standing
    idealMax: number; // Maximum before considered over-posting
    spamThreshold: number; // Immediate kick threshold
    fairShare: number; // Expected share if everyone contributed equally
  } {
    // Fair share = total messages / participants (what each would have if equal)
    const fairShare =
      participantCount > 0 ? totalMessages / participantCount : 0;

    // Ideal participation: between 50% and 150% of fair share
    // But with minimum floors to handle low-activity groups
    const idealMin = Math.max(1, Math.floor(fairShare * 0.5));
    const idealMax = Math.max(5, Math.ceil(fairShare * 1.5));

    // Spam threshold: more than 3x fair share OR more than 20 messages/day
    // The higher of these two catches both relative and absolute spammers
    const maxMessagesPerDay = 20;
    const absoluteSpamThreshold = maxMessagesPerDay * windowDays;
    const relativeSpamThreshold = Math.max(10, Math.ceil(fairShare * 3));
    const spamThreshold = Math.min(
      absoluteSpamThreshold,
      relativeSpamThreshold
    );

    return { idealMin, idealMax, spamThreshold, fairShare };
  }

  /**
   * Calculate kick probability with exponential scaling for over-posting
   *
   * The probability increases exponentially as the user's message count
   * exceeds the ideal max, reaching near-certainty at spam threshold.
   *
   * @returns { probability: number, reason: string, category: 'inactive' | 'low' | 'over' | 'spam' | 'safe' }
   */
  static calculateKickProbability(
    userMessageCount: number,
    totalMessages: number,
    participantCount: number,
    windowDays = 7
  ): {
    probability: number;
    reason: string;
    category: 'inactive' | 'low' | 'over' | 'spam' | 'safe';
  } {
    const thresholds = NPCGroupDynamicsService.calculateDynamicThresholds(
      totalMessages,
      participantCount,
      windowDays
    );

    // Case 1: Never posted - high kick chance (inactive)
    if (userMessageCount === 0) {
      return {
        probability: 0.9,
        reason: 'Never participated in conversation',
        category: 'inactive',
      };
    }

    // Case 2: Spam behavior - immediate kick (exponentially approaching 1.0)
    if (userMessageCount >= thresholds.spamThreshold) {
      // At spam threshold: 95% chance, increases toward 100% for extreme cases
      const excessRatio = userMessageCount / thresholds.spamThreshold;
      const spamProbability = 0.95 + 0.05 * (1 - Math.exp(-excessRatio + 1));
      return {
        probability: Math.min(0.99, spamProbability),
        reason: `Spamming: ${userMessageCount} messages (threshold: ${thresholds.spamThreshold})`,
        category: 'spam',
      };
    }

    // Case 3: Over-posting (between idealMax and spamThreshold)
    // Use exponential increase: probability grows faster as you approach spam threshold
    if (userMessageCount > thresholds.idealMax) {
      const excessMessages = userMessageCount - thresholds.idealMax;
      const range = thresholds.spamThreshold - thresholds.idealMax;
      const normalizedExcess = range > 0 ? excessMessages / range : 0;

      // Exponential curve: starts at ~0.1 for just over max, approaches 0.9 near spam threshold
      // Formula: 0.1 + 0.8 * (1 - e^(-3x)) where x is normalized excess (0 to 1)
      const kickProbability = 0.1 + 0.8 * (1 - Math.exp(-3 * normalizedExcess));

      const userRatio =
        totalMessages > 0 ? (userMessageCount / totalMessages) * 100 : 0;
      return {
        probability: kickProbability,
        reason: `Over-posting: ${userMessageCount} messages (${userRatio.toFixed(0)}% of total, ideal max: ${thresholds.idealMax})`,
        category: 'over',
      };
    }

    // Case 4: Low participation (only if group has meaningful activity)
    if (userMessageCount < thresholds.idealMin && totalMessages > 20) {
      // Linear scale from 0.2 (just under minimum) to 0.5 (at 1 message)
      const ratio =
        thresholds.idealMin > 1
          ? (userMessageCount - 1) / (thresholds.idealMin - 1)
          : 0;
      const lowProbability = 0.5 - 0.3 * ratio;

      return {
        probability: Math.max(0.2, lowProbability),
        reason: `Low participation: ${userMessageCount} messages (minimum ideal: ${thresholds.idealMin})`,
        category: 'low',
      };
    }

    // Case 5: Good participation - safe zone!
    return {
      probability: 0,
      reason: '', // No reason needed for safe category
      category: 'safe',
    };
  }

  /**
   * Kick users with weighted randomness based on dynamic participation metrics
   *
   * Uses dynamic thresholds based on group activity level:
   * - Never posted: 90% kick probability
   * - Low participation: 20-50% based on how far below ideal minimum
   * - Over-posting: Exponential increase from 10% to 90% as messages approach spam threshold
   * - Spam (3x fair share or 20+/day): 95%+ kick probability
   *
   * All probabilities are then multiplied by a per-tick factor (5%) to make
   * kicks gradual rather than immediate.
   */
  private static async kickUsersWithWeightedLogic(): Promise<number> {
    let usersKicked = 0;

    // Only check for kicks some of the time
    if (Math.random() > NPCGroupDynamicsService.KICK_CHECK_CHANCE) {
      return 0;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get all group chats
    const groupList = await db
      .select()
      .from(chats)
      .where(eq(chats.isGroup, true));

    for (const group of groupList) {
      // Get participants for this group
      const participantList = await db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, group.id));

      // Get recent messages
      const recentMsgs = await db
        .select({ senderId: messages.senderId })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, group.id),
            gte(messages.createdAt, sevenDaysAgo)
          )
        );

      // Get user details for participants (both users and agents, excluding NPCs)
      const participantUserIds = participantList.map((p) => p.userId);
      const participantUsers =
        participantUserIds.length > 0
          ? await db
              .select({
                id: users.id,
                displayName: users.displayName,
                isActor: users.isActor,
                isAgent: users.isAgent,
              })
              .from(users)
              .where(
                and(
                  inArray(users.id, participantUserIds),
                  eq(users.isActor, false)
                )
              )
          : [];

      if (participantUsers.length === 0) continue;

      // Calculate message counts for all users in the group
      const totalMessages = recentMsgs.length;
      const messageCounts = new Map<string, number>();

      for (const msg of recentMsgs) {
        messageCounts.set(
          msg.senderId,
          (messageCounts.get(msg.senderId) || 0) + 1
        );
      }

      // Total active participants includes NPCs for fair share calculation
      const totalParticipants = participantList.length;

      // Calculate kick probabilities for each non-NPC participant
      for (const participant of participantUsers) {
        const userId = participant.id;
        const userMessageCount = messageCounts.get(userId) || 0;

        const {
          probability: kickProbability,
          reason,
          category,
        } = NPCGroupDynamicsService.calculateKickProbability(
          userMessageCount,
          totalMessages,
          totalParticipants,
          7 // 7-day window
        );

        // Skip safe users
        if (category === 'safe' || kickProbability === 0) {
          continue;
        }

        // Apply the probability with per-tick multiplier
        // 5% base multiplier, but spam gets 20% (faster kick for egregious behavior)
        const tickMultiplier = category === 'spam' ? 0.2 : 0.05;

        if (Math.random() < kickProbability * tickMultiplier) {
          // Remove from chat participants
          await db
            .delete(chatParticipants)
            .where(
              and(
                eq(chatParticipants.chatId, group.id),
                eq(chatParticipants.userId, userId)
              )
            );

          // If GroupChatMembership exists, mark as removed
          await db
            .update(groupChatMemberships)
            .set({
              isActive: false,
              removedAt: new Date(),
              sweepReason: reason,
            })
            .where(
              and(
                eq(groupChatMemberships.chatId, group.id),
                eq(groupChatMemberships.userId, userId)
              )
            );

          usersKicked++;
          logger.info(
            'User kicked from group with weighted logic',
            {
              userId,
              userName: participant.displayName,
              isAgent: participant.isAgent,
              chatId: group.id,
              chatName: group.name,
              reason,
              category,
              kickProbability: kickProbability.toFixed(2),
              effectiveProbability: (kickProbability * tickMultiplier).toFixed(
                4
              ),
              messageCount: userMessageCount,
              totalMessages,
              totalParticipants,
            },
            'NPCGroupDynamicsService'
          );
        }
      }
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
    // Get total group count
    const [countResult] = await db
      .select({ count: count() })
      .from(chats)
      .where(eq(chats.isGroup, true));
    const totalGroups = countResult?.count ?? 0;

    // Get all groups
    const groupList = await db
      .select()
      .from(chats)
      .where(eq(chats.isGroup, true));

    // Get participant counts for each group
    let activeGroups = 0;
    let totalMembers = 0;

    for (const group of groupList) {
      const [partCountResult] = await db
        .select({ count: count() })
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, group.id));
      const participantCount = partCountResult?.count ?? 0;

      if (participantCount >= NPCGroupDynamicsService.MIN_GROUP_SIZE) {
        activeGroups++;
      }
      totalMembers += participantCount;
    }

    const avgGroupSize =
      groupList.length > 0 ? totalMembers / groupList.length : 0;

    return {
      totalGroups,
      activeGroups,
      totalMembers,
      avgGroupSize,
    };
  }
}
