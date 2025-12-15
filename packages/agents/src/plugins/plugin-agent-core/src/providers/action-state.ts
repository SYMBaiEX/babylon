/**
 * Action State Provider
 *
 * Provides previous action results from the current multi-step execution.
 * This tracks what actions have been taken and their outcomes.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from '@elizaos/core';
import type { ActionTraceResult } from '../types';

/**
 * Format action results for LLM context
 */
function formatActionResults(results: ActionTraceResult[]): string {
  if (results.length === 0) {
    return 'No actions taken yet in this request.';
  }

  return results
    .map((result, index) => {
      const status = result.success ? '✓ Success' : '✗ Failed';
      let text = `${index + 1}. **${result.actionType}** - ${status}`;

      if (result.summary) {
        text += `\n   Summary: ${result.summary}`;
      }

      if (result.error) {
        text += `\n   Error: ${result.error}`;
      }

      if (result.result && Object.keys(result.result).length > 0) {
        const resultStr = Object.entries(result.result)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');
        text += `\n   Result: ${resultStr}`;
      }

      return text;
    })
    .join('\n\n');
}

/**
 * Action State Provider
 *
 * Provides context about actions taken during the current multi-step execution.
 * Used by the LLM to make informed decisions about next steps.
 */
export const actionStateProvider: Provider = {
  name: 'ACTION_STATE',
  description: 'Previous action results from the current execution',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    // Get action results from state (populated during multi-step execution)
    const actionResults = (state.data?.actionResults ||
      []) as ActionTraceResult[];

    const formattedResults = formatActionResults(actionResults);

    const completedCount = actionResults.filter((r) => r.success).length;
    const failedCount = actionResults.filter((r) => !r.success).length;

    return {
      data: {
        actionResults,
        completedCount,
        failedCount,
      },
      values: {
        actionResults: formattedResults,
        hasActionResults: actionResults.length > 0,
        completedActions: completedCount,
        failedActions: failedCount,
        totalActions: actionResults.length,
      },
      text:
        actionResults.length > 0
          ? `# Actions Taken This Request\n\n${formattedResults}`
          : 'No actions taken yet.',
    };
  },
};
