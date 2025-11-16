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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Babylon API Documentation</h1>
          <p className="text-muted-foreground text-lg mb-4">
            Complete interactive API reference for the Babylon social conspiracy game
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <a 
              href="/api/docs" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground underline"
            >
              View JSON Spec
            </a>
            <span>•</span>
            <span>Automatically generated from route documentation</span>
          </div>
        </div>
        
        <div className="bg-card rounded-lg shadow-lg overflow-hidden border">
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







