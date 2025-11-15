/**
 * OpenAPI Specification API Route
 * 
 * @description Serves the automatically generated OpenAPI specification in JSON format
 * 
 * @route GET /api/docs
 * @access Public
 * @returns {object} OpenAPI 3.0 specification
 */

import { NextResponse } from 'next/server';
import { generateAutoSpec } from '@/lib/swagger/auto-generator';

/**
 * GET /api/docs
 * 
 * @description Returns the complete OpenAPI specification for all API routes.
 * Automatically generated from @openapi tags in route files.
 * 
 * @returns {NextResponse} OpenAPI specification in JSON format
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/docs');
 * const spec = await response.json();
 * console.log(spec.paths); // All API paths
 * ```
 */
export async function GET() {
  try {
    const spec = await generateAutoSpec() as { openapi?: string; swagger?: string; [key: string]: unknown }; // Now automated!
    
    // Ensure openapi version field is present (required by Swagger UI)
    if (!spec.openapi && !spec.swagger) {
      spec.openapi = '3.0.0';
    }
    
    return NextResponse.json(spec, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error generating API docs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate API documentation',
        openapi: '3.0.0',
        info: {
          title: 'Babylon API',
          version: '1.0.0',
          description: 'API documentation temporarily unavailable'
        },
        paths: {}
      },
      { status: 500 }
    );
  }
}

