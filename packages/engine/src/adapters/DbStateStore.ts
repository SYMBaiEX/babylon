/**
 * Database-backed state store for game tick execution.
 * Implements GameStateStore interface for production use.
 */

import {
  actors,
  and,
  db,
  eq,
  lte,
  markets,
  organizations,
  posts,
  questions,
  worldEvents,
} from '@babylon/db';
import { generateSnowflakeId } from '@babylon/shared';
import type {
  ActiveMarket,
  ActiveQuestion,
  ArticleInput,
  EventInput,
  GameActor,
  GameOrganization,
  GameStateStore,
  Position,
  PostInput,
  QuestionInput,
  TradeInput,
  TradeResult,
} from '../GameTick';

export class DbStateStore implements GameStateStore {
  async getActiveQuestions(): Promise<ActiveQuestion[]> {
    const rows = await db
      .select()
      .from(questions)
      .where(eq(questions.status, 'active'));

    return rows.map((q) => ({
      id: q.id,
      questionNumber: q.questionNumber,
      text: q.text,
      status: q.status as 'active' | 'resolved',
      outcome: q.outcome ?? undefined,
      resolutionDate: q.resolutionDate ?? undefined,
      scenarioId: q.scenarioId ?? undefined,
    }));
  }

  async getQuestionsToResolve(beforeTime: Date): Promise<ActiveQuestion[]> {
    const rows = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.status, 'active'),
          lte(questions.resolutionDate, beforeTime)
        )
      );

    return rows.map((q) => ({
      id: q.id,
      questionNumber: q.questionNumber,
      text: q.text,
      status: q.status as 'active' | 'resolved',
      outcome: q.outcome ?? undefined,
      resolutionDate: q.resolutionDate ?? undefined,
      scenarioId: q.scenarioId ?? undefined,
    }));
  }

  async createQuestion(question: QuestionInput): Promise<string> {
    const id = await generateSnowflakeId();
    const questionNumber = Date.now() % 100000;

    await db.insert(questions).values({
      id,
      questionNumber,
      text: question.text,
      status: 'active',
      outcome: false, // Default outcome until resolved
      rank: 1, // Default rank
      resolutionDate: question.resolutionDate,
      scenarioId: question.scenarioId ?? 1, // Default to scenario 1 if not provided
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return id;
  }

  async resolveQuestion(questionId: string, outcome: boolean): Promise<void> {
    await db
      .update(questions)
      .set({
        status: 'resolved',
        outcome,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, questionId));
  }

  async getActiveMarkets(): Promise<ActiveMarket[]> {
    const rows = await db
      .select()
      .from(markets)
      .where(eq(markets.resolved, false));

    return rows.map((m) => ({
      id: m.id,
      questionNumber: 0, // Markets don't have questionNumber directly
      yesShares: Number(m.yesShares),
      noShares: Number(m.noShares),
      yesPrice:
        Number(m.yesShares) / (Number(m.yesShares) + Number(m.noShares) || 1),
      noPrice:
        Number(m.noShares) / (Number(m.yesShares) + Number(m.noShares) || 1),
      resolved: m.resolved,
    }));
  }

  async updateMarketPrice(
    _marketId: string,
    _yesPrice: number,
    _noPrice: number
  ): Promise<void> {
    // Prices are derived from shares - no direct update needed
  }

  async createPost(post: PostInput): Promise<string> {
    const id = await generateSnowflakeId();

    await db.insert(posts).values({
      id,
      authorId: post.authorId,
      content: post.content,
      type: post.type,
      timestamp: post.timestamp,
      gameId: 'continuous',
    });

    return id;
  }

  async createEvent(event: EventInput): Promise<string> {
    const id = await generateSnowflakeId();

    await db.insert(worldEvents).values({
      id,
      eventType: event.type,
      description: event.description,
      dayNumber: event.day,
      actors: event.actors,
      visibility: event.visibility,
      pointsToward: event.pointsToward,
      relatedQuestion: event.relatedQuestion,
      timestamp: new Date(),
    });

    return id;
  }

  async createArticle(article: ArticleInput): Promise<string> {
    const id = await generateSnowflakeId();

    await db.insert(posts).values({
      id,
      type: 'article',
      articleTitle: article.title,
      content: article.summary,
      fullContent: article.content,
      authorId: article.authorOrgId,
      timestamp: article.timestamp,
      category: article.category,
      gameId: 'continuous',
    });

    return id;
  }

  async getActors(limit = 50): Promise<GameActor[]> {
    const rows = await db.select().from(actors).limit(limit);

    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      tier: a.tier ?? undefined,
      personality: a.personality ?? undefined,
      domain: Array.isArray(a.domain)
        ? a.domain
        : a.domain
          ? [a.domain]
          : undefined,
    }));
  }

  async getOrganizations(): Promise<GameOrganization[]> {
    const rows = await db.select().from(organizations);

    return rows.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type as 'company' | 'media' | 'government',
    }));
  }

  async executeTrade(_trade: TradeInput): Promise<TradeResult> {
    // Trade execution requires full TradeExecutionService
    return {
      success: false,
      error: 'Use TradeExecutionService for trade execution',
    };
  }

  async getPositions(_actorId: string): Promise<Position[]> {
    // Positions are managed through pools - use NPCInvestmentManager for full access
    return [];
  }
}
