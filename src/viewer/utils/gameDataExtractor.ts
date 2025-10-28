/**
 * Game Data Extractor
 * Utilities to extract and format data from GeneratedGame for viewer components
 */
import type { GeneratedGame, GameHistory } from '../../generator/GameGenerator';
import type { GameRecapData, ActorMoodState } from '../components';

/**
 * Extract recap data from a game and its history
 */
export function extractGameRecapData(
  game: GeneratedGame,
  previousGames: GameHistory[] = [],
  currentDay: number = 1
): GameRecapData {
  // Get actor mood states for current day
  const dayTimeline = game.timeline[currentDay - 1] || game.timeline[0];
  const actorMoodStates: ActorMoodState[] = [];

  // Build actor mood states from the game
  game.setup.mainActors.forEach(actor => {
    actorMoodStates.push({
      id: actor.id,
      name: actor.name,
      mood: actor.initialMood,
      luck: actor.initialLuck,
      description: actor.description,
    });
  });

  // Apply mood/luck changes up to current day
  for (let i = 0; i < currentDay && i < game.timeline.length; i++) {
    const day = game.timeline[i];

    // Apply luck changes
    day?.luckChanges?.forEach(change => {
      const actor = actorMoodStates.find(a => a.id === change.actor);
      if (actor) {
        actor.luck = change.to as 'low' | 'medium' | 'high';
      }
    });

    // Apply mood changes
    day?.moodChanges?.forEach(change => {
      const actor = actorMoodStates.find(a => a.id === change.actor);
      if (actor) {
        actor.mood = change.to;
      }
    });
  }

  // Calculate start and end dates
  const startDate = game.timeline[0]?.summary.split(':')[0] || '2025-11-01';
  const endDate = game.timeline[game.timeline.length - 1]?.summary.split(':')[0] || '2025-11-30';

  // Infer game number from ID or default to 1
  const gameNumber = parseInt(game.id.match(/\d+/)?.[0] || '1');

  return {
    previousGames,
    mainActors: game.setup.mainActors.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description || '',
      tier: a.tier,
      role: a.role,
      domain: a.domain || [],
    })),
    scenarios: game.setup.scenarios,
    questions: game.setup.questions,
    actorMoodStates,
    relationships: game.setup.connections,
    gameNumber,
    startDate,
    endDate,
    worldSummary: generateWorldSummary(game, currentDay, dayTimeline),
    previousContext: generatePreviousContext(previousGames),
  };
}

/**
 * Generate world summary from game setup
 */
function generateWorldSummary(
  game: GeneratedGame,
  currentDay?: number,
  dayTimeline?: GeneratedGame['timeline'][0]
): string {
  const scenarios = game.setup.scenarios;
  const mainActors = game.setup.mainActors;

  const scenarioThemes = [...new Set(scenarios.map(s => s.theme))].join(', ');
  const actorNames = mainActors.slice(0, 3).map(a => a.name).join(', ');

  let summary = `The world is focused on ${scenarioThemes}. Key players include ${actorNames}. ` +
    `${scenarios.length} major scenarios are unfolding over the next 30 days, ` +
    `with ${game.setup.questions.length} prediction markets tracking the outcomes. ` +
    `${game.setup.connections.length} relationships between actors will influence how events unfold.`;

  // Add current day context if timeline data provided
  if (currentDay && dayTimeline) {
    const eventCount = dayTimeline.events?.length || 0;
    const postCount = dayTimeline.feedPosts?.length || 0;
    summary += ` Currently on Day ${currentDay}: ${eventCount} events occurred, ${postCount} posts in the feed.`;
  }

  return summary;
}

/**
 * Generate previous context summary from game history
 */
function generatePreviousContext(previousGames: GameHistory[]): string {
  if (previousGames.length === 0) {
    return '';
  }

  const lastGame = previousGames[previousGames.length - 1];
  if (!lastGame) {
    return '';
  }

  const totalGames = previousGames.length;

  let context = `Over the past ${totalGames} game${totalGames > 1 ? 's' : ''}, `;

  // Add summary from last game
  context += lastGame.summary + ' ';

  // Add key outcomes
  if (lastGame.keyOutcomes && lastGame.keyOutcomes.length > 0) {
    const outcomes = lastGame.keyOutcomes.slice(0, 2).map(o =>
      `${o.questionText} (${o.outcome ? 'YES' : 'NO'})`
    );
    context += `Key outcomes included: ${outcomes.join('; ')}. `;
  }

  // Add highlights
  if (lastGame.highlights && lastGame.highlights.length > 0) {
    context += `Notable events: ${lastGame.highlights[0]}`;
  }

  return context;
}

/**
 * Get actor emotional state at specific day
 */
export function getActorStateAtDay(
  game: GeneratedGame,
  actorId: string,
  day: number
): { mood: number; luck: 'low' | 'medium' | 'high' } {
  const actor = game.setup.mainActors.find(a => a.id === actorId) ||
                game.setup.supportingActors.find(a => a.id === actorId);
  
  if (!actor) {
    return { mood: 0, luck: 'medium' };
  }
  
  let mood = actor.initialMood;
  let luck = actor.initialLuck;
  
  // Apply changes up to the specified day
  for (let i = 0; i < day && i < game.timeline.length; i++) {
    const dayData = game.timeline[i];
    if (!dayData) continue;

    // Apply luck changes
    const luckChange = dayData.luckChanges?.find(c => c.actor === actorId);
    if (luckChange) {
      luck = luckChange.to as 'low' | 'medium' | 'high';
    }

    // Apply mood changes
    const moodChange = dayData.moodChanges?.find(c => c.actor === actorId);
    if (moodChange) {
      mood = moodChange.to;
    }
  }
  
  return { mood, luck };
}

