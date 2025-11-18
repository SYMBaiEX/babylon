/**
 * Automated OpenAPI Specification Generator
 * 
 * @module lib/swagger/auto-generator
 * @description Automatically generates OpenAPI spec from @openapi tags in route files
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerDefinition } from './config';
import type { Options } from 'swagger-jsdoc';
import path from 'path';

const options: Options = {
  definition: swaggerDefinition,
  // Scan all route files for @openapi JSDoc comments
  // Use absolute paths for better reliability
  apis: [
    path.join(process.cwd(), 'src/app/api/**/*.ts'),
    path.join(process.cwd(), 'src/app/api/**/*.tsx'),
  ],
};

/**
 * OpenAPI specification type
 */
interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Generate OpenAPI specification automatically from JSDoc comments
 * 
 * @description Scans all API route files for @openapi tags and generates
 * a complete OpenAPI 3.0 specification. This eliminates the need for manual
 * spec maintenance.
 * 
 * @returns {object} Complete OpenAPI 3.0 specification
 * 
 * @example
 * ```typescript
 * import { generateAutoSpec } from '@/lib/swagger/auto-generator';
 * 
 * const spec = generateAutoSpec();
 * console.log(spec.paths); // All documented paths
 * ```
 */
export async function generateAutoSpec() {
  const autoSpec: OpenAPISpec = swaggerJsdoc(options) as OpenAPISpec;
  
  // Ensure openapi version field is present (required by Swagger UI)
  if (!autoSpec.openapi && !autoSpec.swagger) {
    autoSpec.openapi = swaggerDefinition.openapi || '3.0.0';
  }
  
  // Ensure all required OpenAPI fields are present
  if (!autoSpec.info) {
    autoSpec.info = swaggerDefinition.info;
  }
  
  // Merge with manual generator to fill in missing routes
  // This ensures we have complete documentation even if swagger-jsdoc misses some routes
  const { generateOpenApiSpec } = await import('./generator');
  const manualSpec = generateOpenApiSpec();
  
  // Merge paths: auto-generated takes precedence, but manual fills gaps
  const mergedSpec: OpenAPISpec = {
    ...swaggerDefinition,
    ...autoSpec,
    paths: {
      ...(manualSpec.paths || {}),
      ...(autoSpec.paths || {}), // Auto-generated paths override manual ones
    },
    tags: [
      ...(Array.isArray(manualSpec.tags) ? manualSpec.tags : []),
      ...(Array.isArray(autoSpec.tags) ? autoSpec.tags : []),
    ],
  };
  
  // Remove duplicate tags
  const uniqueTags = new Map();
  if (Array.isArray(mergedSpec.tags)) {
    mergedSpec.tags.forEach((tag: { name: string; description?: string }) => {
      if (!uniqueTags.has(tag.name)) {
        uniqueTags.set(tag.name, tag);
      }
      });
    mergedSpec.tags = Array.from(uniqueTags.values());
  }
  
  return mergedSpec;
}

