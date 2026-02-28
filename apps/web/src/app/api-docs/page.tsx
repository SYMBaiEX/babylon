/**
 * Swagger UI Documentation Page
 *
 * @description Interactive API documentation using Swagger UI
 *
 * @page /api-docs
 * @access Public
 */

'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

/**
 * API Documentation Page Component
 *
 * @description Renders the Swagger UI with the generated OpenAPI specification
 *
 * @returns {JSX.Element} Swagger UI documentation page
 */
export default function ApiDocsPage() {
  return (
    <div className="min-h-dvh bg-background md:min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="mb-2 font-bold text-4xl">Babylon API Documentation</h1>
          <p className="mb-4 text-lg text-muted-foreground">
            Complete interactive API reference for the Babylon social conspiracy
            game
          </p>
          <div className="flex gap-4 text-muted-foreground text-sm">
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              View JSON Spec
            </a>
            <span>•</span>
            <span>Automatically generated from route documentation</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card shadow-lg">
          <SwaggerUI
            url="/api/docs"
            docExpansion="list"
            defaultModelsExpandDepth={2}
            defaultModelExpandDepth={2}
            displayRequestDuration={true}
            filter={true}
            showExtensions={true}
            showCommonExtensions={true}
            tryItOutEnabled={true}
            persistAuthorization={true}
            deepLinking={true}
            displayOperationId={false}
            supportedSubmitMethods={['get', 'post', 'put', 'patch', 'delete']}
            requestInterceptor={(request) => {
              // Add any default headers or modify requests here
              return request;
            }}
            responseInterceptor={(response) => {
              // Handle responses if needed
              return response;
            }}
          />
        </div>
      </div>
    </div>
  );
}
