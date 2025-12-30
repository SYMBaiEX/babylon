import { db, posts, type Question, worldEvents } from '@babylon/db';
import type { BabylonLLMClient } from '@babylon/engine';
import { generateSnowflakeId, logger } from '@babylon/shared';
import { ArticleGenerator } from '../ArticleGenerator';
import {
  type ArcEventStatus,
  NewsArticlePacingEngine,
} from '../NewsArticlePacingEngine';
import { toSafeDayNumber } from '../utils/date-utils';
import { secureRandom, weightedPick } from '../utils/entropy';
import { generateArticleImageWithRetry } from './article-image-service';
import { characterMappingService } from './character-mapping-service';
import {
  getArcPlan,
  getPhaseForDay,
  getSignalDirection,
} from './narrative-state-service';
import { StaticDataRegistry } from './static-data-registry';

// Singleton pacing engine for arc event coverage tracking
const arcEventPacer = new NewsArticlePacingEngine();

// Minimal question type for event generation (only fields actually used)
// outcome is optional - only used for arc plan signal direction, and the code handles missing outcome
type QuestionForEvent = Pick<Question, 'id' | 'text' | 'questionNumber'> & {
  outcome?: boolean | null;
};

/**
 * Event types with weights and templates for variety
 */
type EventTypeConfig = {
  type: string;
  weight: number;
  templates: string[];
  visibility: 'public' | 'leaked' | 'private';
  requiresActors: boolean;
};

const EVENT_TYPES: EventTypeConfig[] = [
  {
    type: 'announcement',
    weight: 25,
    templates: [
      'Official statement released regarding {topic}',
      'Press release confirms developments in {topic}',
      'Spokesperson addresses questions about {topic}',
    ],
    visibility: 'public',
    requiresActors: false,
  },
  {
    type: 'leak',
    weight: 15,
    templates: [
      'Anonymous source reveals details about {topic}',
      'Internal documents surface regarding {topic}',
      'Whistleblower alleges new information on {topic}',
      'Leaked memo suggests developments in {topic}',
    ],
    visibility: 'leaked',
    requiresActors: false,
  },
  {
    type: 'meeting',
    weight: 12,
    templates: [
      'Key figures meet to discuss {topic}',
      'Emergency meeting called regarding {topic}',
      'Private gathering addresses {topic} concerns',
      'High-level discussions underway on {topic}',
    ],
    visibility: 'public',
    requiresActors: true,
  },
  {
    type: 'development',
    weight: 20,
    templates: [
      'New evidence emerges in {topic}',
      'Significant progress reported on {topic}',
      'Breaking: Major update on {topic}',
      'Sources confirm movement on {topic}',
    ],
    visibility: 'public',
    requiresActors: false,
  },
  {
    type: 'rumor',
    weight: 10,
    templates: [
      'Speculation grows around {topic}',
      'Unconfirmed reports suggest changes in {topic}',
      'Industry insiders whisper about {topic}',
      'Social media abuzz with theories on {topic}',
    ],
    visibility: 'public',
    requiresActors: false,
  },
  {
    type: 'scandal',
    weight: 8,
    templates: [
      'Controversy erupts over {topic}',
      'Allegations surface regarding {topic}',
      'Public outcry follows revelations about {topic}',
    ],
    visibility: 'public',
    requiresActors: true,
  },
  {
    type: 'revelation',
    weight: 10,
    templates: [
      'Investigation reveals new facts about {topic}',
      'Documentary evidence confirms {topic} details',
      'Analysis uncovers hidden aspects of {topic}',
    ],
    visibility: 'public',
    requiresActors: false,
  },
];

/**
 * Select a random event type based on weights
 */
function selectEventType(): EventTypeConfig {
  return weightedPick(EVENT_TYPES, (config) => config.weight);
}

/**
 * Sanitize topic text by removing any remaining template variables
 */
function sanitizeTopic(topic: string): string {
  // Remove common template variables that may have leaked through
  return topic
    .replace(/\{resolutionDate\}/gi, 'the resolution date')
    .replace(/\{resolution_date\}/gi, 'the resolution date')
    .replace(/\{date\}/gi, 'the scheduled date')
    .replace(/\{[a-zA-Z_]+\}/g, '') // Remove any other template variables
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate a description from template
 */
function generateDescription(
  template: string,
  topic: string,
  actors: string[]
): string {
  // Sanitize topic to remove any template variable leakage
  const cleanTopic = sanitizeTopic(topic);
  let description = template.replace('{topic}', cleanTopic);

  // Add actor names if template supports it
  if (actors.length > 0) {
    const actorNames = actors
      .map((id) => {
        const actor = StaticDataRegistry.getActor(id);
        return actor?.name || 'Unknown';
      })
      .filter((name) => name !== 'Unknown');

    if (actorNames.length > 0 && description.includes('Key figures')) {
      description = description.replace(
        'Key figures',
        actorNames.slice(0, 2).join(' and ')
      );
    }
  }

  return description;
}

/**
 * Select random actors relevant to a question
 */
function selectRelevantActors(maxActors: number = 2): string[] {
  const allActors = StaticDataRegistry.getAllActors();
  if (allActors.length === 0) return [];

  // Prefer S_TIER and A_TIER actors (most influential)
  const tieredActors = allActors.filter(
    (a) => a.tier === 'S_TIER' || a.tier === 'A_TIER'
  );
  const pool = tieredActors.length > 0 ? tieredActors : allActors;

  // Randomly select actors
  const selected: string[] = [];
  const shuffled = [...pool].sort(() => secureRandom() - 0.5);

  for (let i = 0; i < Math.min(maxActors, shuffled.length); i++) {
    const actor = shuffled[i];
    if (actor) {
      selected.push(actor.id);
    }
  }

  return selected;
}

/**
 * Generate diverse events based on active questions
 *
 * @description
 * Generates events with varied types (announcements, leaks, meetings, rumors, etc.)
 * and signal direction based on the narrative arc plan. Events have a `pointsToward`
 * field that indicates whether the event suggests YES or NO outcome.
 *
 * Event types are weighted to create realistic news cycles:
 * - Announcements (25%): Official statements
 * - Developments (20%): Progress updates
 * - Leaks (15%): Insider information
 * - Meetings (12%): Key figure gatherings
 * - Rumors (10%): Unconfirmed speculation
 * - Revelations (10%): Investigation results
 * - Scandals (8%): Controversies
 *
 * @param questions - Active questions to generate events for
 * @param timestamp - Timestamp for the generated events
 * @param currentDay - Current game day (optional, used for arc plan phase detection)
 * @returns Number of events created
 */
export async function generateEvents(
  questions: QuestionForEvent[],
  timestamp: Date,
  currentDay?: number
): Promise<number> {
  if (questions.length === 0) return 0;

  let eventsCreated = 0;
  const eventsToGenerate = Math.min(2, questions.length);

  for (let i = 0; i < eventsToGenerate; i++) {
    const question = questions[i];

    if (!question || !question.text) {
      continue;
    }

    // Validate integer fields to prevent overflow
    const questionNum =
      typeof question.questionNumber === 'number' &&
      Number.isFinite(question.questionNumber) &&
      question.questionNumber >= 0 &&
      question.questionNumber <= 2147483647
        ? question.questionNumber
        : undefined;

    const safeDayNumber =
      typeof currentDay === 'number' ? toSafeDayNumber(currentDay) : undefined;

    // Get arc plan for signal direction
    let pointsToward: 'YES' | 'NO' | null = null;
    let phase: 'early' | 'middle' | 'late' | 'climax' | undefined;

    if (currentDay !== undefined) {
      const arcPlan = await getArcPlan(question.id);
      if (arcPlan) {
        phase = getPhaseForDay(currentDay, arcPlan);
        // Events don't have an actor, so pass empty string
        // Use question.outcome if available, default to true
        const outcome = question.outcome ?? true;
        const signal = getSignalDirection(arcPlan, phase, '', outcome);
        pointsToward = signal.direction === 'NEUTRAL' ? null : signal.direction;

        logger.debug(
          'Event signal direction determined',
          {
            questionId: question.id,
            currentDay,
            phase,
            pointsToward,
            outcome,
          },
          'EventGeneration'
        );
      }
    }

    // Select event type with weighted randomness
    const eventConfig = selectEventType();

    // Select random template from the event type
    const templateIndex = Math.floor(
      secureRandom() * eventConfig.templates.length
    );
    const template = eventConfig.templates[templateIndex] || '{topic}';

    // Extract topic from question text (simplified extraction)
    const topic =
      question.text.length > 100
        ? question.text.slice(0, 100) + '...'
        : question.text;

    // Select actors if required by event type
    const actors = eventConfig.requiresActors ? selectRelevantActors(2) : [];

    // Generate description
    const description = generateDescription(template, topic, actors);

    // Adjust visibility based on phase (late game has more leaks/revelations)
    let visibility = eventConfig.visibility;
    if (phase === 'late' || phase === 'climax') {
      // In late game, even leaks become public knowledge faster
      if (visibility === 'leaked' && secureRandom() < 0.3) {
        visibility = 'public';
      }
    }

    await db.insert(worldEvents).values({
      id: await generateSnowflakeId(),
      eventType: eventConfig.type,
      description,
      actors,
      relatedQuestion: questionNum,
      visibility,
      gameId: 'continuous',
      dayNumber: safeDayNumber,
      timestamp: timestamp,
      pointsToward,
    });
    eventsCreated++;

    logger.debug(
      'Generated diverse event',
      {
        eventType: eventConfig.type,
        visibility,
        hasActors: actors.length > 0,
        questionId: question.id,
      },
      'EventGeneration'
    );
  }

  return eventsCreated;
}

/**
 * Generate articles for an arc event (event-driven article generation)
 *
 * @description
 * Articles are now ONLY generated when arc events occur. This function:
 * 1. Checks which orgs haven't reported on this event's current status
 * 2. Generates 1-2 articles from uncovered orgs
 * 3. Records coverage to prevent duplicate reporting
 *
 * An org can only report on an event once per status. If the event
 * updates or resolves, they can report again.
 *
 * @param arcEventId - ID of the arc event
 * @param eventStatus - Current status of the event (created/updated/resolved)
 * @param question - Related question for context
 * @param llmClient - LLM client for article generation
 * @param timestamp - Timestamp for the articles
 * @param dayNumber - Current game day
 * @returns Number of articles created
 */
export async function generateArticlesForArcEvent(
  arcEventId: string,
  eventStatus: ArcEventStatus,
  question: QuestionForEvent,
  llmClient: BabylonLLMClient,
  timestamp: Date,
  dayNumber?: number
): Promise<number> {
  // Get news organizations that haven't reported on this event status
  const newsOrgs = StaticDataRegistry.getOrganizationsByType('media');
  if (newsOrgs.length === 0) {
    logger.warn(
      'No news organizations available for arc event articles',
      { arcEventId },
      'EventGeneration'
    );
    return 0;
  }

  // Select orgs that haven't covered this event status yet (max 2)
  const orgsToPublish = arcEventPacer.selectOrgsForArcEvent(
    arcEventId,
    eventStatus,
    newsOrgs,
    2 // Maximum 2 orgs per event status
  );

  if (orgsToPublish.length === 0) {
    logger.debug(
      'All orgs have already covered this arc event status',
      { arcEventId, eventStatus },
      'EventGeneration'
    );
    return 0;
  }

  // Get actors for article context
  const actorsList = StaticDataRegistry.getTopActors(20);

  // Initialize article generator
  const articleGen = new ArticleGenerator(llmClient);

  // Generate articles in parallel
  const articlePromises = orgsToPublish.map(async (orgData) => {
    const org = {
      id: orgData.id,
      name: orgData.name || 'Unknown Organization',
      description: orgData.description || '',
      type: (orgData.type as 'company' | 'media' | 'government') || 'media',
      canBeInvolved: orgData.canBeInvolved,
      initialPrice: orgData.initialPrice ?? undefined,
      currentPrice: orgData.initialPrice ?? undefined,
    };

    // Determine article stage based on event status
    const stage =
      eventStatus === 'created'
        ? 'breaking'
        : eventStatus === 'resolved'
          ? 'resolution'
          : 'commentary';

    const article = await articleGen.generateArticleForQuestion(
      {
        id: question.id,
        text: question.text,
        scenario: 1,
        outcome: question.outcome ?? false,
        rank: 1,
        createdDate: new Date().toISOString().split('T')[0]!,
        resolutionDate: '',
        status: 'active',
      },
      org,
      stage,
      actorsList.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
        domain: Array.isArray(a.domain) ? a.domain : [a.domain || 'tech'],
        personality: a.personality || undefined,
        tier: a.tier ?? undefined,
        affiliations: a.affiliations || [],
        postStyle: a.postStyle || undefined,
        postExample: a.postExample || '',
        role: a.role as 'main' | 'supporting' | 'extra' | undefined,
        initialLuck: (a.initialLuck as 'low' | 'medium' | 'high') || 'medium',
        initialMood: a.initialMood || 0,
      })),
      [] // Events are included in context via question
    );

    // Transform content to replace real names with parody names
    const transformedSummary = await characterMappingService.transformText(
      article.summary || ''
    );
    const transformedContent = await characterMappingService.transformText(
      article.content || ''
    );
    const transformedTitle = await characterMappingService.transformText(
      article.title || 'Untitled'
    );

    const articleTimestamp = article.publishedAt || timestamp;
    const articleId = await generateSnowflakeId();

    // Generate article cover image (non-blocking, with retry)
    let imageUrl: string | null = null;
    if (process.env.FAL_KEY) {
      imageUrl = await generateArticleImageWithRetry({
        title: transformedTitle.transformedText,
        summary: transformedSummary.transformedText,
        category: article.category,
      });
    }

    await db.insert(posts).values({
      id: articleId,
      type: 'article',
      content: transformedSummary.transformedText,
      fullContent: transformedContent.transformedText,
      articleTitle: transformedTitle.transformedText,
      byline: article.byline || undefined,
      biasScore: article.biasScore || undefined,
      sentiment: article.sentiment || undefined,
      slant: article.slant || undefined,
      category: article.category || undefined,
      imageUrl: imageUrl || undefined,
      authorId: article.authorOrgId,
      gameId: 'continuous',
      dayNumber: dayNumber,
      timestamp: articleTimestamp,
    });

    // Record that this org has covered this event status
    arcEventPacer.recordArcEventCoverage(
      arcEventId,
      org.id,
      eventStatus,
      articleId
    );

    logger.info(
      'Generated arc event article',
      {
        arcEventId,
        eventStatus,
        org: org.name,
        articleId,
        title: transformedTitle.transformedText.slice(0, 50),
      },
      'EventGeneration'
    );

    return 1;
  });

  const results = await Promise.allSettled(articlePromises);

  const articlesCreated = results.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value;
    }
    logger.warn(
      'Failed to generate arc event article',
      { error: result.reason },
      'EventGeneration'
    );
    return sum;
  }, 0);

  logger.info(
    'Arc event articles generated',
    {
      arcEventId,
      eventStatus,
      articlesCreated,
      attempted: orgsToPublish.length,
    },
    'EventGeneration'
  );

  return articlesCreated;
}

/**
 * Get arc event coverage statistics
 */
export function getArcEventCoverageStats() {
  return arcEventPacer.getArcEventCoverageStats();
}
