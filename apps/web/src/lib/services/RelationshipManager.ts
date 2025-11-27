/**
 * Relationship Manager Service
 *
 * @description Handles all actor relationship logic including relationship queries,
 * follow management, relationship context for LLM prompts, and related actor selection
 * for events and content. Provides comprehensive relationship management for NPCs.
 */

import {
  actorFollows,
  actorRelationships,
  actors,
  and,
  count,
  db,
  desc,
  eq,
  inArray,
  or,
} from '@/db';
import type {
  Actor,
  ActorRelationship,
  ActorTier,
  RELATIONSHIP_TYPES,
} from '@/shared/types';

/**
 * Relationship context for LLM prompts
 */
export interface RelationshipContext {
  actorId: string;
  relationships: Array<{
    otherActorId: string;
    otherActorName: string;
    type: string;
    strength: number;
    sentiment: number;
    history?: string;
  }>;
  contextString: string;
}

/**
 * Relationship statistics for an actor
 */
export interface RelationshipStats {
  actorId: string;
  followerCount: number;
  followingCount: number;
  mutualFollowCount: number;
  relationshipCount: number;
  relationshipsByType: Record<string, number>;
}

/**
 * Relationship Manager Class
 */
export class RelationshipManager {
  /**
   * Get all relationships for an actor
   */
  static async getActorRelationships(
    actorId: string
  ): Promise<ActorRelationship[]> {
    const relationships = await db
      .select()
      .from(actorRelationships)
      .where(
        or(
          eq(actorRelationships.actor1Id, actorId),
          eq(actorRelationships.actor2Id, actorId)
        )
      );

    return relationships.map((rel) => ({
      id: rel.id,
      actor1Id: rel.actor1Id,
      actor2Id: rel.actor2Id,
      relationshipType:
        rel.relationshipType as (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES],
      strength: rel.strength,
      sentiment: rel.sentiment,
      isPublic: rel.isPublic,
      history: rel.history || undefined,
      affects: rel.affects as Record<string, number> | undefined,
      createdAt: rel.createdAt,
      updatedAt: rel.updatedAt,
    }));
  }

  /**
   * Get specific relationship between two actors
   */
  static async getRelationship(
    actor1Id: string,
    actor2Id: string
  ): Promise<ActorRelationship | null> {
    const [relationship] = await db
      .select()
      .from(actorRelationships)
      .where(
        or(
          and(
            eq(actorRelationships.actor1Id, actor1Id),
            eq(actorRelationships.actor2Id, actor2Id)
          ),
          and(
            eq(actorRelationships.actor1Id, actor2Id),
            eq(actorRelationships.actor2Id, actor1Id)
          )
        )
      )
      .limit(1);

    if (!relationship) return null;

    return {
      id: relationship.id,
      actor1Id: relationship.actor1Id,
      actor2Id: relationship.actor2Id,
      relationshipType:
        relationship.relationshipType as (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES],
      strength: relationship.strength,
      sentiment: relationship.sentiment,
      isPublic: relationship.isPublic,
      history: relationship.history || undefined,
      affects: relationship.affects as Record<string, number> | undefined,
      createdAt: relationship.createdAt,
      updatedAt: relationship.updatedAt,
    };
  }

  /**
   * Get actors that this actor follows
   */
  static async getFollowing(
    actorId: string
  ): Promise<Array<Actor & { followedAt: Date }>> {
    const follows = await db
      .select({
        followingId: actorFollows.followingId,
        createdAt: actorFollows.createdAt,
      })
      .from(actorFollows)
      .where(eq(actorFollows.followerId, actorId))
      .orderBy(desc(actorFollows.createdAt));

    const followingIds = follows.map((f) => f.followingId);
    if (followingIds.length === 0) return [];

    const followedActors = await db
      .select()
      .from(actors)
      .where(inArray(actors.id, followingIds));

    const actorMap = new Map(followedActors.map((a) => [a.id, a]));

    return follows
      .map((f) => {
        const actor = actorMap.get(f.followingId);
        if (!actor) return null;
        return {
          ...RelationshipManager.mapActorFromDb(actor),
          followedAt: f.createdAt,
        };
      })
      .filter((a): a is Actor & { followedAt: Date } => a !== null);
  }

  /**
   * Get actors that follow this actor
   */
  static async getFollowers(
    actorId: string
  ): Promise<Array<Actor & { followedAt: Date }>> {
    const follows = await db
      .select({
        followerId: actorFollows.followerId,
        createdAt: actorFollows.createdAt,
      })
      .from(actorFollows)
      .where(eq(actorFollows.followingId, actorId))
      .orderBy(desc(actorFollows.createdAt));

    const followerIds = follows.map((f) => f.followerId);
    if (followerIds.length === 0) return [];

    const followerActors = await db
      .select()
      .from(actors)
      .where(inArray(actors.id, followerIds));

    const actorMap = new Map(followerActors.map((a) => [a.id, a]));

    return follows
      .map((f) => {
        const actor = actorMap.get(f.followerId);
        if (!actor) return null;
        return {
          ...RelationshipManager.mapActorFromDb(actor),
          followedAt: f.createdAt,
        };
      })
      .filter((a): a is Actor & { followedAt: Date } => a !== null);
  }

  /**
   * Check if actor1 follows actor2
   */
  static async isFollowing(
    actor1Id: string,
    actor2Id: string
  ): Promise<boolean> {
    const [follow] = await db
      .select({ id: actorFollows.id })
      .from(actorFollows)
      .where(
        and(
          eq(actorFollows.followerId, actor1Id),
          eq(actorFollows.followingId, actor2Id)
        )
      )
      .limit(1);

    return follow !== undefined;
  }

  /**
   * Get relationship context for LLM prompts
   */
  static async getRelationshipContext(
    actorId: string,
    relevantActorIds: string[]
  ): Promise<RelationshipContext> {
    if (relevantActorIds.length === 0) {
      return {
        actorId,
        relationships: [],
        contextString: '',
      };
    }

    const relationships = await db
      .select()
      .from(actorRelationships)
      .where(
        or(
          and(
            eq(actorRelationships.actor1Id, actorId),
            inArray(actorRelationships.actor2Id, relevantActorIds)
          ),
          and(
            inArray(actorRelationships.actor1Id, relevantActorIds),
            eq(actorRelationships.actor2Id, actorId)
          )
        )
      );

    // Get actor names
    const allActorIds = [
      ...new Set(relationships.flatMap((r) => [r.actor1Id, r.actor2Id])),
    ];
    const actorsList = await db
      .select({ id: actors.id, name: actors.name })
      .from(actors)
      .where(inArray(actors.id, allActorIds));
    const actorNameMap = new Map(actorsList.map((a) => [a.id, a.name]));

    const relationshipData = relationships.map((rel) => {
      const isActor1 = rel.actor1Id === actorId;
      const otherActorId = isActor1 ? rel.actor2Id : rel.actor1Id;

      return {
        otherActorId,
        otherActorName: actorNameMap.get(otherActorId) || 'Unknown',
        type: rel.relationshipType,
        strength: rel.strength,
        sentiment: rel.sentiment,
        history: rel.history || undefined,
      };
    });

    const contextString =
      RelationshipManager.formatRelationshipContext(relationshipData);

    return {
      actorId,
      relationships: relationshipData,
      contextString,
    };
  }

  /**
   * Format relationship context for LLM prompts
   */
  private static formatRelationshipContext(
    relationships: Array<{
      otherActorName: string;
      type: string;
      strength: number;
      sentiment: number;
      history?: string;
    }>
  ): string {
    if (relationships.length === 0) return '';

    const lines = relationships.map((rel) => {
      const sentimentDesc =
        rel.sentiment > 0.5
          ? 'respect them'
          : rel.sentiment < -0.5
            ? 'have beef with them'
            : 'neutral toward them';

      const strengthDesc =
        rel.strength > 0.7
          ? 'strong'
          : rel.strength > 0.4
            ? 'moderate'
            : 'weak';

      let line = `- ${strengthDesc} ${rel.type} with ${rel.otherActorName} (you ${sentimentDesc})`;

      if (rel.history) {
        line += `: ${rel.history}`;
      }

      return line;
    });

    return lines.join('\n');
  }

  /**
   * Get related actors for events and content generation
   */
  static async getRelatedActors(
    actorId: string,
    count: number,
    relationshipTypes?: string[]
  ): Promise<Actor[]> {
    const query = db
      .select()
      .from(actorRelationships)
      .where(
        or(
          eq(actorRelationships.actor1Id, actorId),
          eq(actorRelationships.actor2Id, actorId)
        )
      )
      .orderBy(
        desc(actorRelationships.strength),
        desc(actorRelationships.sentiment)
      )
      .limit(count * 2);

    const relationships = await query;

    // Filter by relationship types if specified
    const filteredRelationships =
      relationshipTypes && relationshipTypes.length > 0
        ? relationships.filter((r) =>
            relationshipTypes.includes(r.relationshipType)
          )
        : relationships;

    const relatedActorIds = filteredRelationships.map((rel) =>
      rel.actor1Id === actorId ? rel.actor2Id : rel.actor1Id
    );

    if (relatedActorIds.length === 0) return [];

    // Fetch full actor details
    const relatedActors = await db
      .select()
      .from(actors)
      .where(inArray(actors.id, relatedActorIds));

    // Remove duplicates and limit to count
    const uniqueActors = Array.from(new Set(relatedActors.map((a) => a.id)))
      .map((id) => relatedActors.find((a) => a.id === id)!)
      .slice(0, count);

    return uniqueActors.map((a) => RelationshipManager.mapActorFromDb(a));
  }

  /**
   * Get relationship statistics for an actor
   */
  static async getRelationshipStats(
    actorId: string
  ): Promise<RelationshipStats> {
    const [
      followerCountResult,
      followingCountResult,
      mutualFollowCountResult,
      relationships,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(actorFollows)
        .where(eq(actorFollows.followingId, actorId)),
      db
        .select({ count: count() })
        .from(actorFollows)
        .where(eq(actorFollows.followerId, actorId)),
      db
        .select({ count: count() })
        .from(actorFollows)
        .where(
          and(
            eq(actorFollows.followingId, actorId),
            eq(actorFollows.isMutual, true)
          )
        ),
      db
        .select({ relationshipType: actorRelationships.relationshipType })
        .from(actorRelationships)
        .where(
          or(
            eq(actorRelationships.actor1Id, actorId),
            eq(actorRelationships.actor2Id, actorId)
          )
        ),
    ]);

    const relationshipsByType: Record<string, number> = {};
    relationships.forEach((rel) => {
      relationshipsByType[rel.relationshipType] =
        (relationshipsByType[rel.relationshipType] || 0) + 1;
    });

    return {
      actorId,
      followerCount: followerCountResult[0]?.count ?? 0,
      followingCount: followingCountResult[0]?.count ?? 0,
      mutualFollowCount: mutualFollowCountResult[0]?.count ?? 0,
      relationshipCount: relationships.length,
      relationshipsByType,
    };
  }

  /**
   * Get actors with no followers (for verification/fixing)
   */
  static async getActorsWithNoFollowers(): Promise<Actor[]> {
    // Get all actors
    const allActors = await db.select().from(actors);

    // Get all followed actor IDs
    const followedActors = await db
      .selectDistinct({ followingId: actorFollows.followingId })
      .from(actorFollows);

    const followedIds = new Set(followedActors.map((f) => f.followingId));

    // Filter actors with no followers
    const actorsWithNoFollowers = allActors.filter(
      (a) => !followedIds.has(a.id)
    );

    return actorsWithNoFollowers.map((a) =>
      RelationshipManager.mapActorFromDb(a)
    );
  }

  /**
   * Get relationship behavioral modifiers
   */
  static getRelationshipModifiers(relationship: ActorRelationship): {
    mentionLikelihood: number;
    postFrequency: number;
    supportLikelihood: number;
    attackLikelihood: number;
  } {
    const affects = relationship.affects || {};

    // Default modifiers based on relationship type and sentiment
    const baseModifiers = {
      mentionLikelihood:
        Math.abs(relationship.sentiment) * relationship.strength,
      postFrequency: relationship.strength * 0.5,
      supportLikelihood:
        Math.max(0, relationship.sentiment) * relationship.strength,
      attackLikelihood:
        Math.max(0, -relationship.sentiment) * relationship.strength,
    };

    // Apply custom modifiers from relationship
    return {
      mentionLikelihood:
        affects.mentionLikelihood ?? baseModifiers.mentionLikelihood,
      postFrequency: affects.postFrequency ?? baseModifiers.postFrequency,
      supportLikelihood:
        affects.supportLikelihood ?? baseModifiers.supportLikelihood,
      attackLikelihood:
        affects.attackLikelihood ?? baseModifiers.attackLikelihood,
    };
  }

  /**
   * Map DB actor to shared Actor type
   */
  private static mapActorFromDb(dbActor: {
    id: string;
    name: string;
    description?: string | null;
    domain: string[];
    personality?: string | null;
    role?: string | null;
    affiliations: string[];
    postStyle?: string | null;
    postExample: string[];
    tier?: string | null;
    initialLuck?: string;
    initialMood?: number;
    hasPool?: boolean;
    tradingBalance?: unknown;
    reputationPoints?: number;
    profileImageUrl?: string | null;
  }): Actor {
    return {
      id: dbActor.id,
      name: dbActor.name,
      description: dbActor.description || undefined,
      domain: dbActor.domain || [],
      personality: dbActor.personality || undefined,
      role: dbActor.role || undefined,
      affiliations: dbActor.affiliations || [],
      postStyle: dbActor.postStyle || undefined,
      postExample: dbActor.postExample || [],
      tier: (dbActor.tier as ActorTier | null) || undefined,
      initialLuck:
        (dbActor.initialLuck as 'low' | 'medium' | 'high' | null) || undefined,
      initialMood: dbActor.initialMood ?? undefined,
      tradingBalance: dbActor.tradingBalance
        ? Number(dbActor.tradingBalance)
        : undefined,
      reputationPoints: dbActor.reputationPoints || undefined,
      profileImageUrl: dbActor.profileImageUrl || undefined,
    };
  }
}
