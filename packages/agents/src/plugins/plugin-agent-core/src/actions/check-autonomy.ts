/**
 * Check Autonomy Action
 *
 * Returns the current status of all autonomous features for the agent.
 */

import { getAgentConfig } from '../../../../shared/agent-config';
import { logger } from '../../../../shared/logger';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import type { AutonomyStatus } from '../types';

/**
 * CHECK_AUTONOMY Action
 *
 * Returns the current status of all autonomous features.
 */
export const checkAutonomyAction: Action = {
  name: 'CHECK_AUTONOMY',
  description:
    'Check the current status of all autonomous features (trading, posting, commenting, DMs, group chats)',

  parameters: {},

  examples: [
    [
      {
        name: 'User',
        content: {
          text: 'What are my current autonomous settings?',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me check your current autonomous feature settings.',
          actions: ['CHECK_AUTONOMY'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Which auto features are enabled?',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking your autonomous feature status...',
          actions: ['CHECK_AUTONOMY'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Show me my autonomy settings',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me look up your current settings.',
          actions: ['CHECK_AUTONOMY'],
        },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentId = runtime.agentId;

    try {
      // Get agent config directly from userAgentConfigs table
      const config = await getAgentConfig(agentId);

      // Extract autonomy status from config (defaults to false if no config)
      const status: AutonomyStatus = {
        autonomousTrading: config?.autonomousTrading ?? false,
        autonomousPosting: config?.autonomousPosting ?? false,
        autonomousCommenting: config?.autonomousCommenting ?? false,
        autonomousDMs: config?.autonomousDMs ?? false,
        autonomousGroupChats: config?.autonomousGroupChats ?? false,
      };

      // Format status for display
      const statusLines = [
        `• Trading: ${status.autonomousTrading ? '✅ Enabled' : '❌ Disabled'}`,
        `• Posting: ${status.autonomousPosting ? '✅ Enabled' : '❌ Disabled'}`,
        `• Commenting: ${status.autonomousCommenting ? '✅ Enabled' : '❌ Disabled'}`,
        `• DMs: ${status.autonomousDMs ? '✅ Enabled' : '❌ Disabled'}`,
        `• Group Chats: ${status.autonomousGroupChats ? '✅ Enabled' : '❌ Disabled'}`,
      ];

      const enabledCount = Object.values(status).filter(Boolean).length;
      const totalCount = Object.keys(status).length;

      const summaryText =
        enabledCount === 0
          ? 'All autonomous features are currently disabled.'
          : enabledCount === totalCount
            ? 'All autonomous features are currently enabled.'
            : `${enabledCount} of ${totalCount} autonomous features are enabled.`;

      const responseText = `Current Autonomous Feature Status:\n${statusLines.join('\n')}\n\n${summaryText}`;

      logger.info(
        `[CHECK_AUTONOMY] Status retrieved for agent: ${agentId}`,
        undefined,
        'CheckAutonomy'
      );

      return {
        success: true,
        text: responseText,
        data: {
          status,
          enabledCount,
          totalCount,
        },
        values: {
          ...status,
          enabledCount,
          totalCount,
          statusText: responseText,
        },
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('[CHECK_AUTONOMY] Error:', errorMsg);

      return {
        success: false,
        text: `Failed to check autonomy status: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};

