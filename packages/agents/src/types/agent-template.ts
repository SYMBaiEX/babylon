/**
 * Agent Template Type Definition
 *
 * Pre-configured archetypes for creating new AI agents with personality,
 * trading strategy, and system prompts.
 */

export interface AgentTemplate {
  archetype: string;
  name: string;
  description: string;
  bio: string;
  system: string;
  personality: string;
  tradingStrategy: string;
}

