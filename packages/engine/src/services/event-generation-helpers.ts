import { db, type Question, worldEvents } from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import { toSafeDayNumber } from '../utils/date-utils';
import { secureRandom, weightedPick } from '../utils/entropy';
import {
  getArcPlan,
  getPhaseForDay,
  getSignalDirection,
} from './narrative-state-service';
import { StaticDataRegistry } from './static-data-registry';

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
