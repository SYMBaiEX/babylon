/**
 * Swagger/OpenAPI Utilities
 *
 * @module lib/swagger
 */

export { generateAutoSpec } from './auto-generator'; // Automated generator (preferred)
export { swaggerDefinition, swaggerOptions } from './config';
export { generateOpenApiSpec } from './generator'; // Manual generator (legacy)
export type { OpenAPIParameter, OpenAPIResponse, OpenAPIRoute } from './types';
