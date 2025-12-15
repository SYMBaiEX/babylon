/**
 * Plugin Agent Core
 *
 * Core plugin for agent chat capabilities:
 * - TOGGLE_AUTONOMY action for enabling/disabling autonomous features
 * - CHECK_AUTONOMY action for viewing current autonomous feature status
 * - CREATE_POST action for creating posts on the Babylon feed
 * - Providers for actions, recent messages, and action state
 *
 * @packageDocumentation
 */

import type { Plugin } from '@elizaos/core';
import { checkAutonomyAction } from './actions/check-autonomy';
import { createPostAction } from './actions/create-post';
import { toggleAutonomyAction } from './actions/toggle-autonomy';
import {
  actionStateProvider,
  actionsProvider,
  recentMessagesProvider,
} from './providers';

/**
 * Agent Core Plugin
 */
export const agentCorePlugin: Plugin = {
  name: 'agent-core',
  description:
    'Core agent capabilities for multi-step chat with autonomy control and posting',

  actions: [toggleAutonomyAction, checkAutonomyAction, createPostAction],

  providers: [actionsProvider, recentMessagesProvider, actionStateProvider],
};

export * from './actions';
export { checkAutonomyAction } from './actions/check-autonomy';
export { createPostAction } from './actions/create-post';
// Export individual components
export { toggleAutonomyAction } from './actions/toggle-autonomy';
export * from './providers';
export * from './types';

export default agentCorePlugin;
