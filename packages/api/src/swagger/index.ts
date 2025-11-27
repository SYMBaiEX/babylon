/**
 * Swagger/OpenAPI Utilities
 *
 * @module lib/swagger
 */

export { generateAutoSpec } from './auto-generator'; // JSDoc-based auto-generator (preferred)
export { swaggerDefinition, swaggerOptions } from './config';
export { generateOpenApiSpec } from './generator'; // Programmatic spec generator (fallback)
export type { OpenAPIParameter, OpenAPIResponse, OpenAPIRoute } from './types';
