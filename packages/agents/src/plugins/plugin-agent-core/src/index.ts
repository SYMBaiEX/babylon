/**
 * Plugin Agent Core
 *
 * Core plugin for agent chat capabilities:
 * - TOGGLE_AUTONOMY action for enabling/disabling autonomous features
 * - CHECK_AUTONOMY action for viewing current autonomous feature status
 * - CHECK_PNL action for checking trading performance
 * - CHECK_RECENT_POSTS action for viewing recent posts
 * - CHECK_RECENT_COMMENTS action for viewing recent comments
 * - CREATE_POST action for creating posts on the Babylon feed
 * - Providers for actions, recent messages, and action state
 *
 * @packageDocumentation
 */

import type { Plugin } from '@elizaos/core';
import { checkAutonomyAction } from './actions/check-autonomy';
import { checkPnlAction } from './actions/check-pnl';
import { checkRecentCommentsAction } from './actions/check-recent-comments';
import { checkRecentPostsAction } from './actions/check-recent-posts';
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
    'Core agent capabilities for multi-step chat with autonomy control, posting, and trading insights',

  actions: [
    toggleAutonomyAction,
    checkAutonomyAction,
    checkPnlAction,
    checkRecentPostsAction,
    checkRecentCommentsAction,
    createPostAction,
  ],

  providers: [actionsProvider, recentMessagesProvider, actionStateProvider],
};

export * from './actions';
export * from './providers';
export * from './types';

export default agentCorePlugin;
