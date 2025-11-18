/**
 * World Facts Service
 * 
 * Manages world facts that provide context for game generation.
 * Includes crypto prices, political state, AI developments, etc.
 * 
 * @module services/world-facts-service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { WorldFact } from '@prisma/client';
import { generateSnowflakeId } from '@/lib/snowflake';

export interface WorldFactsContext {
  crypto: string;
  politics: string;
  economy: string;
  technology: string;
  general: string;
  timestamp: string;
  headlines?: string;
}

/**
 * World Facts Service
 * Provides context about the world state for game generation
 */
export class WorldFactsService {
  /**
   * Get all active world facts in randomized order for entropy
   */
  async getAllFacts(): Promise<WorldFact[]> {
    const facts = await prisma.worldFact.findMany({
      where: { isActive: true },
    });
    
    // Randomize order for entropy
    for (let i = facts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = facts[i];
      if (temp && facts[j]) {
        facts[i] = facts[j];
        facts[j] = temp;
      }
    }
    
    return facts;
  }

  /**
   * Get reality grounding facts (category: 'reality-grounding')
   */
  async getRealityGroundingFacts(): Promise<WorldFact[]> {
    const facts = await prisma.worldFact.findMany({
      where: { 
        isActive: true,
        category: 'reality-grounding',
      },
    });
    
    // Randomize order for entropy
    for (let i = facts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = facts[i];
      if (temp && facts[j]) {
        facts[i] = facts[j];
        facts[j] = temp;
      }
    }
    
    return facts;
  }

  /**
   * Get a single fact by category and key (internal use for updates)
   */
  private async getFact(category: string, key: string): Promise<WorldFact | null> {
    return prisma.worldFact.findUnique({
      where: { category_key: { category, key } },
    });
  }

  /**
   * Generate a key from a value string (for database lookup)
   */
  private generateKey(value: string): string {
    let keyPart = (value.split(':')[0] ?? '').trim();
    if (keyPart.length > 50) {
      keyPart = (keyPart.split('.')[0] ?? '').trim();
    }
    return keyPart
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50);
  }

  /**
   * Generate a label from a value string
   */
  private generateLabel(value: string): string {
    const beforeColon = (value.split(':')[0] ?? '').trim();
    if (beforeColon.length <= 60 && beforeColon.length > 0) {
      return beforeColon;
    }
    const firstSentence = (value.split('.')[0] ?? '').trim();
    if (firstSentence.length <= 60) {
      return firstSentence;
    }
    return value.substring(0, 60).trim();
  }

  /**
   * Update or create a world fact by value (simple string)
   */
  async setFactByValue(value: string): Promise<WorldFact> {
    const defaultCategory = 'general';
    const key = this.generateKey(value);
    const label = this.generateLabel(value);
    
    const existing = await this.getFact(defaultCategory, key);

    if (existing) {
      return prisma.worldFact.update({
        where: { id: existing.id },
        data: {
          label,
          value,
          source: 'default',
          priority: 0,
          lastUpdated: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return prisma.worldFact.create({
      data: {
        id: await generateSnowflakeId(),
        category: defaultCategory,
        key,
        label,
        value,
        source: 'default',
        priority: 0,
        lastUpdated: new Date(),
      },
    });
  }

  /**
   * Update an existing fact by ID
   */
  async updateFactById(id: string, value: string): Promise<WorldFact> {
    const existing = await prisma.worldFact.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Fact not found');
    }

    const label = this.generateLabel(value);

    return prisma.worldFact.update({
      where: { id },
      data: {
        label,
        value,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Generate formatted context string for game generation
   * This is injected into LLM prompts for events, questions, etc.
   */
  async generateWorldContext(includeHeadlines = true): Promise<WorldFactsContext> {
    const facts = await this.getAllFacts();

    // Format all facts (already randomized) - just use the value directly
    const formattedFacts = facts
      .map(f => `- ${f.value}`)
      .join('\n');

    // Get recent headlines if requested
    let headlinesContext = undefined;
    if (includeHeadlines) {
      const { createParodyHeadlineGenerator } = await import('./parody-headline-generator');
      const generator = createParodyHeadlineGenerator();
      headlinesContext = await generator.generateDailySummary();
    }

    return {
      crypto: formattedFacts,
      politics: formattedFacts,
      economy: formattedFacts,
      technology: formattedFacts,
      general: formattedFacts,
      timestamp: new Date().toISOString(),
      headlines: headlinesContext,
    };
  }

  /**
   * Generate formatted string for injection into prompts
   */
  async generatePromptContext(): Promise<string> {
    const context = await this.generateWorldContext(true);

    return `
=== WORLD CONTEXT (Current Reality) ===
Date/Time: ${context.timestamp}

${context.general}

${context.headlines ? `\n${context.headlines}\n` : ''}
=========================================

This context reflects the current state of the world. Use these facts to make your content feel grounded in current reality (within our satirical universe).
`.trim();
  }

  /**
   * Delete a world fact
   */
  async deleteFact(id: string): Promise<void> {
    await prisma.worldFact.delete({
      where: { id },
    });
  }

  /**
   * Toggle fact active status
   */
  async toggleFactActive(id: string): Promise<WorldFact> {
    const fact = await prisma.worldFact.findUnique({ where: { id } });
    if (!fact) throw new Error('Fact not found');

    return prisma.worldFact.update({
      where: { id },
      data: { isActive: !fact.isActive },
    });
  }

  /**
   * Bulk update facts (array of simple strings)
   */
  async bulkUpdateFacts(values: string[]): Promise<void> {
    for (const value of values) {
      await this.setFactByValue(value);
    }

    logger.info(
      `Bulk updated ${values.length} world facts`,
      { count: values.length },
      'WorldFactsService'
    );
  }
}

// Singleton instance
export const worldFactsService = new WorldFactsService();


