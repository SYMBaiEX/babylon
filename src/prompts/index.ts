/**
 * Prompt Registry
 * 
 * Central export for all prompt definitions.
 * Import prompts directly for type safety and tree-shaking.
 */

// Re-export utilities
export { definePrompt, renderTemplate } from './define-prompt';
export { renderPrompt, getPromptParams } from './loader';
export type { PromptDefinition } from './define-prompt';

// Re-export style guide
export { BABYLON_STYLE_GUIDE, getPersonalityGuidance, getDegenIntensity, getAISelfAwareness } from './style-guide';

// Prompts by category
// Feed prompts
export { companyPost } from './feed/company-post';
export { governmentPost } from './feed/government-post';
export { mediaPost } from './feed/media-post';
export { reply } from './feed/reply';
export { directReaction } from './feed/direct-reaction';
export { journalistPost } from './feed/journalist-post';
export { analystReaction } from './feed/analyst-reaction';
export { stockTicker } from './feed/stock-ticker';
export { minuteAmbient } from './feed/minute-ambient';
export { ambientPosts } from './feed/ambient-posts';
export { replies } from './feed/replies';
export { reactions } from './feed/reactions';
export { commentary } from './feed/commentary';
export { conspiracy } from './feed/conspiracy';
export { newsPosts } from './feed/news-posts';

// Game prompts
export { dayTransition } from './game/day-transition';
export { groupMessages } from './game/group-messages';
export { resolutionEvent } from './game/resolution-event';
export { questionRankings } from './game/question-rankings';
export { baselineEvent } from './game/baseline-event';
export { questionResolutionValidation } from './game/question-resolution-validation';
export { questionResolvedFeed } from './game/question-resolved-feed';
export { scenarios } from './game/scenarios';
export { groupChatName } from './game/group-chat-name';
export { dayEvents } from './game/day-events';
export { questions } from './game/questions';
export { groupMessage } from './game/group-message';
export { priceAnnouncement } from './game/price-announcement';
export { questionGeneration } from './game/question-generation';

// Image prompts
export { actorPortrait, actorBanner } from './image/actor-portrait';
export { organizationLogo, organizationBanner } from './image/organization-logo';
export { userProfileBanner } from './image/user-profile-banner';
export { userProfilePicture } from './image/user-profile-picture';

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
