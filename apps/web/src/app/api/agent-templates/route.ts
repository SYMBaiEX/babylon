/**
 * Agent Templates API
 *
 * @route GET /api/agent-templates
 * @access Public
 *
 * @description
 * Returns all available agent templates. Uses TypeScript imports for optimal
 * performance and type safety.
 *
 * @returns {Promise<NextResponse>} JSON response with templates data
 */

import { NextResponse } from 'next/server';
import { getAllTemplates, getTemplateIds } from '@babylon/agents';

/**
 * GET /api/agent-templates
 *
 * @description Fetches all available agent templates
 *
 * @returns {Promise<NextResponse>} Templates data
 */
export async function GET() {
  try {
    const templates = getAllTemplates();
    const templateIds = getTemplateIds();
    
    return NextResponse.json({
      templates: Array.from(templateIds),
      templatesData: templates,
    });
  } catch (error) {
    console.error('Error loading agent templates:', error);
    return NextResponse.json(
      { error: 'Failed to load agent templates' },
      { status: 500 }
    );
  }
}

