/**
 * Training Package Initialization
 *
 * This module sets up all dependencies required by the training package.
 * Import this before using TrajectoryGenerator or other training services.
 *
 * Usage:
 *   import { initializeTrainingPackage } from '@babylon/training/init-training';
 *   await initializeTrainingPackage();
 */

import { logger } from '@babylon/shared';
import {
  configureTrainingDependencies,
  type IAgentRuntimeManager,
  type IAgentService,
  type IAutonomousCoordinator,
  type ILLMCaller,
} from './dependencies';

let initialized = false;

/**
 * Initialize training package with dependencies from @babylon/agents
 *
 * This dynamically imports @babylon/agents to avoid circular dependencies
 * at module load time.
 */
export async function initializeTrainingPackage(): Promise<void> {
  if (initialized) {
    logger.debug('Training package already initialized', {}, 'TrainingInit');
    return;
  }

  logger.info('Initializing training package...', {}, 'TrainingInit');

  try {
    // Dynamically import @babylon/agents to get real implementations
    // @ts-ignore - Dynamic import of @babylon/agents (not a compile-time dependency)
    const agentsModule = await import('@babylon/agents');

    // Get the agentService (implements IAgentService)
    // The agentService from @babylon/agents has createAgent method matching IAgentService
    const agentService = agentsModule.agentService as IAgentService;

    // Get the agentRuntimeManager (implements IAgentRuntimeManager)
    const runtimeManager = agentsModule.agentRuntimeManager;
    const agentRuntimeManager: IAgentRuntimeManager = {
      getRuntime: (agentId: string) => runtimeManager.getRuntime(agentId),
      resetRuntime: async (agentId: string) => {
        await runtimeManager.clearRuntime(agentId);
      },
    };

    // Get the autonomousCoordinator (implements IAutonomousCoordinator)
    const coordinator = agentsModule.autonomousCoordinator;
    const autonomousCoordinator: IAutonomousCoordinator = {
      executeAutonomousTick: async (
        agentUserId,
        agentRuntime,
        recordTrajectories
      ) => {
        const result = await coordinator.executeAutonomousTick(
          agentUserId,
          agentRuntime,
          recordTrajectories
        );
        return {
          success: result.success,
          actionsExecuted: result.actionsExecuted,
          trajectoryId: result.trajectoryId,
        };
      },
    };

    // Get the LLM caller from agents (uses groqLLMCaller)
    const llmModule = agentsModule;
    const llmCaller: ILLMCaller = {
      callGroqDirect: async (params) => {
        // Use the groqLLMCaller if available
        if ('groqLLMCaller' in llmModule) {
          const groqCaller = llmModule.groqLLMCaller as {
            callGroqDirect: typeof params extends infer P
              ? (p: P) => Promise<string>
              : never;
          };
          return groqCaller.callGroqDirect(params);
        }

        // Fallback: use fetch to call Groq API directly
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          throw new Error('GROQ_API_KEY not set');
        }

        const modelMap = {
          small: 'llama-3.1-8b-instant',
          medium: 'llama-3.1-70b-versatile',
          large: 'llama-3.1-70b-versatile',
        };

        const model = modelMap[params.modelSize || 'medium'];

        const response = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: params.system },
                { role: 'user', content: params.prompt },
              ],
              temperature: params.temperature ?? 0.7,
              max_tokens: params.maxTokens ?? 1024,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Groq API error: ${response.status}`);
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        return data.choices[0]?.message.content || '';
      },
    };

    // Configure all dependencies
    configureTrainingDependencies({
      agentService,
      agentRuntimeManager,
      autonomousCoordinator,
      llmCaller,
    });

    initialized = true;
    logger.info(
      'Training package initialized successfully',
      {},
      'TrainingInit'
    );
  } catch (error) {
    logger.error(
      'Failed to initialize training package',
      { error: error instanceof Error ? error.message : String(error) },
      'TrainingInit'
    );
    throw error;
  }
}

/**
 * Check if training package is initialized
 */
export function isTrainingInitialized(): boolean {
  return initialized;
}

/**
 * Reset initialization state (for testing)
 */
export function resetTrainingInitialization(): void {
  initialized = false;
}
