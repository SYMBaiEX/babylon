/**
 * Admin World Facts API
 * 
 * @route GET /api/admin/world-facts - Get world facts
 * @route POST /api/admin/world-facts - Create/update world facts
 * @route DELETE /api/admin/world-facts - Delete world fact
 * @access Admin
 * 
 * @description
 * Manages world facts, RSS feeds, parody headlines, and character mappings.
 * GET returns all facts and related data. POST creates/updates facts.
 * DELETE removes a fact.
 * 
 * @openapi
 * /api/admin/world-facts:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get world facts
 *     description: Returns all world facts, RSS feeds, parodies, and mappings (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Facts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 facts:
 *                   type: array
 *                 rssFeeds:
 *                   type: array
 *                 parodies:
 *                   type: array
 *                 characterMappings:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *   post:
 *     tags:
 *       - Admin
 *     summary: Create/update world facts
 *     description: Creates or updates world facts (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Facts updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *   delete:
 *     tags:
 *       - Admin
 *     summary: Delete world fact
 *     description: Deletes a world fact (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               factId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Fact deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * const { facts } = await fetch('/api/admin/world-facts', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import type { NextRequest } from 'next/server';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { requireAdmin } from '@/lib/api/admin-middleware';
import { worldFactsService } from '@/lib/services/world-facts-service';
import { rssFeedService } from '@/lib/services/rss-feed-service';
import { createParodyHeadlineGenerator } from '@/lib/services/parody-headline-generator';
import { characterMappingService } from '@/lib/services/character-mapping-service';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/world-facts - Get all world facts and related data
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const facts = await worldFactsService.getAllFacts();
  const rssFeeds = await rssFeedService.getUntransformedHeadlines(10);
  const parodyGenerator = createParodyHeadlineGenerator();
  const recentParodies = await parodyGenerator.getRecentParodies(10);
  const characterMappings = await characterMappingService.getCharacterMappings();
  const organizationMappings = await characterMappingService.getOrganizationMappings();

  const context = await worldFactsService.generateWorldContext(true);

  return successResponse({
    facts,
    rssFeeds,
    recentParodies,
    characterMappings,
    organizationMappings,
    context,
  });
});

/**
 * POST /api/admin/world-facts - Create or update world facts
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const body = await request.json();
  const { action, data } = body;

  switch (action) {
    case 'update_fact': {
      const { category, key, label, value, source, priority } = data;
      const fact = await worldFactsService.setFact(
        category,
        key,
        label,
        value,
        source,
        priority
      );
      logger.info(`Updated world fact: ${category}.${key}`, { fact }, 'WorldFactsAdmin');
      return successResponse({ fact });
    }

    case 'bulk_update_facts': {
      await worldFactsService.bulkUpdateFacts(data.facts);
      return successResponse({ success: true });
    }

    case 'toggle_fact': {
      const fact = await worldFactsService.toggleFactActive(data.id);
      return successResponse({ fact });
    }

    case 'fetch_rss': {
      // Trigger RSS feed fetch manually
      const result = await rssFeedService.fetchAllFeeds();
      logger.info('Manual RSS fetch triggered', result, 'WorldFactsAdmin');
      return successResponse({ result });
    }

    case 'generate_parodies': {
      // Generate parodies from untransformed headlines
      const headlines = await rssFeedService.getUntransformedHeadlines(10);
      const generator = createParodyHeadlineGenerator();
      const parodies = await generator.processHeadlines(headlines);
      logger.info(`Generated ${parodies.length} parody headlines`, undefined, 'WorldFactsAdmin');
      return successResponse({ parodies });
    }

    case 'refresh_mappings': {
      // Refresh character/org mapping cache
      characterMappingService.refreshCache();
      return successResponse({ success: true });
    }

    default:
      return successResponse({ error: 'Unknown action' }, 400);
  }
});

/**
 * DELETE /api/admin/world-facts - Delete a world fact
 */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return successResponse({ error: 'Missing id parameter' }, 400);
  }

  await worldFactsService.deleteFact(id);
  logger.info(`Deleted world fact: ${id}`, undefined, 'WorldFactsAdmin');

  return successResponse({ success: true });
});




