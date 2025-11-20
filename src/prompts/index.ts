/**
 * Prompt Registry
 * 
 * Central export for all prompt definitions across the application.
 * Provides a single import point for all prompts, enabling type safety
 * and tree-shaking. Prompts are organized by category (feed, game, image,
 * system, world, trading).
 * 
 * @example
 * ```ts
 * import { ambientPost, renderPrompt } from '@/prompts';
 * 
 * const prompt = renderPrompt(ambientPost, {
 *   actorName: 'Alice',
 *   actorDescription: 'Tech CEO'
 * });
 * ```
 */

// Re-export utilities
export { definePrompt, renderTemplate } from './define-prompt';
export { renderPrompt, getPromptParams } from './loader';
export type { PromptDefinition } from './define-prompt';

// World Context & Reality Grounding
export {
  generateWorldContext,
  generateWorldActors,
  generateCurrentMarkets,
  generateActivePredictions,
  generateRecentTrades,
  getParodyActorNames,
  getForbiddenRealNames,
  validateNoRealNames,
  validateGeneratedContent,
  getCurrentDateContext,
  getRealityGrounding,
  getMinimalRealityGrounding,
  getFullRealityGrounding,
  checkRealityGrounding,
} from './world-context';
export type { WorldContext, WorldContextOptions } from './world-context';

// Prompts by category
// Feed prompts
export { companyPost } from './feed/company-post';
export { newsPosts } from './feed/news-posts';
export { analystReaction } from './feed/analyst-reaction';
export { governmentPost } from './feed/government-post';
export { ambientPosts } from './feed/ambient-posts';
export { stockTicker } from './feed/stock-ticker';
export { minuteAmbient } from './feed/minute-ambient';
export { replies } from './feed/replies';
export { reply } from './feed/reply';
export { conspiracy } from './feed/conspiracy';
export { reactions } from './feed/reactions';
export { commentary } from './feed/commentary';

// Game prompts
export { dayTransition } from './game/day-transition';
export { groupMessages } from './game/group-messages';
export { phaseContext } from './game/phase-context';
export { questionRankings } from './game/question-rankings';
export { baselineEvent } from './game/baseline-event';
export { biasedArticle } from './game/biased-article';
export { questionResolutionValidation } from './game/question-resolution-validation';
export { questionResolvedFeed } from './game/question-resolved-feed';
export { scenarios } from './game/scenarios';
export { groupChatName } from './game/group-chat-name';
export { dayEvents } from './game/day-events';
export { questions } from './game/questions';
export { groupMessage } from './game/group-message';
export { priceAnnouncement } from './game/price-announcement';
export { questionGeneration } from './game/question-generation';
export { worldImpactAssessment } from './game/world-impact';

// Image prompts
export { actorPortrait, actorBanner } from './image/actor-portrait';
export { userProfileBanner } from './image/user-profile-banner';
export { organizationLogo, organizationBanner } from './image/organization-logo';
export { userProfilePicture } from './image/user-profile-picture';

// System prompts
export { xmlAssistant } from './system/json-assistant';

// World prompts
export { rumor } from './world/rumor';
export { expertAnalysis } from './world/expert-analysis';
export { npcConversation } from './world/npc-conversation';
export { daySummary } from './world/day-summary';
export { newsReport } from './world/news-report';

// Trading prompts
export { npcMarketDecisions } from './trading/npc-market-decisions';

/**
 * Usage examples:
 * 
 * import { ambientPost, renderPrompt } from '@/prompts';
 * 
 * const prompt = renderPrompt(ambientPost, {
 *   actorName: 'Alice',
 *   actorDescription: 'Tech CEO'
 * });
 * 
 * const params = getPromptParams(ambientPost);
 * // { temperature: 0.9, maxTokens: 5000 }
 */
