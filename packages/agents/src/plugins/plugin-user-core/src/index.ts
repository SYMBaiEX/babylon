/**
 * Plugin User Core
 *
 * Core plugin for the user coordinator in team chat.
 * Provides limited actions and context for helping users coordinate their agents.
 *
 * Key differences from plugin-agent-core:
 * - Limited action set (read-only, informational)
 * - No trading, posting, or agent-specific actions
 * - Coordinator context provider for guiding users
 * - All providers are coordinator-specific (not shared with agents)
 *
 * @packageDocumentation
 */

import type { Plugin } from '@elizaos/core';
import { checkMarketsAction } from './actions';
import {
  coordinatorActionStateProvider,
  coordinatorActionsProvider,
  coordinatorContextProvider,
  coordinatorRecentMessagesProvider,
  coordinatorTeamMembersProvider,
} from './providers';

/**
 * User Core Plugin
 *
 * Provides capabilities for the user coordinator:
 * - CHECK_MARKETS action for market information
 * - Coordinator-specific providers for actions, messages, team members, and context
 */
export const userCorePlugin: Plugin = {
  name: 'user-core',
  description:
    'Core capabilities for user coordinator with limited actions for team chat coordination',

  actions: [
    // Informational actions only
    checkMarketsAction,
    // More actions can be added later as needed
  ],

  providers: [
    // Coordinator-specific providers
    coordinatorActionsProvider,
    coordinatorRecentMessagesProvider,
    coordinatorActionStateProvider,
    coordinatorTeamMembersProvider,
    coordinatorContextProvider,
  ],
};

// Export individual components
export { checkMarketsAction } from './actions';
export {
  coordinatorActionStateProvider,
  coordinatorActionsProvider,
  coordinatorContextProvider,
  coordinatorRecentMessagesProvider,
  coordinatorTeamMembersProvider,
} from './providers';
export * from './types';

export default userCorePlugin;
