/**
 * Agent Template by Archetype API
 *
 * @route GET /api/agent-templates/[archetype]
 * @access Public
 *
 * @description
 * Returns a specific agent template by archetype ID. Uses TypeScript imports
 * for optimal performance and type safety.
 *
 * @returns {Promise<NextResponse>} JSON response with template data
 */

import { NextResponse } from 'next/server';
import { getTemplate } from '@babylon/agents';

/**
 * GET /api/agent-templates/[archetype]
 *
 * @description Fetches a specific agent template by archetype
 *
 * @returns {Promise<NextResponse>} Template data
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archetype: string }> }
) {
  try {
    const { archetype } = await params;
    const template = getTemplate(archetype);
    
    if (!template) {
      return NextResponse.json(
        { error: `Template '${archetype}' not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error loading agent template:', error);
    return NextResponse.json(
      { error: 'Failed to load agent template' },
      { status: 500 }
    );
  }
}

