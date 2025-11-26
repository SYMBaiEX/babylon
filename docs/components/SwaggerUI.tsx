'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUIBundle = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => <div style={{ padding: '2rem', textAlign: 'center' }}>Loading API documentation...</div>
});

// Import Swagger UI CSS
import 'swagger-ui-react/swagger-ui.css';

// OpenAPI Server type
interface OpenAPIServer {
  url: string;
  description?: string;
}

// OpenAPI Spec type (simplified)
interface OpenAPISpec {
  openapi?: string;
  info?: Record<string, unknown>;
  servers?: OpenAPIServer[];
  paths?: Record<string, unknown>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SwaggerUIProps {
  spec?: object;
  url?: string;
}

export default function SwaggerUI({ spec, url }: SwaggerUIProps) {
  const [swaggerSpec, setSwaggerSpec] = useState<OpenAPISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSpec = async () => {
      try {
        let data: OpenAPISpec;
        
        if (spec) {
          data = spec as OpenAPISpec;
        } else if (url) {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to load OpenAPI spec: ${response.statusText}`);
          }
          data = await response.json() as OpenAPISpec;
        } else {
          // Default: try to load from public/openapi.json
          const response = await fetch('/openapi.json');
          if (!response.ok) {
            throw new Error(`Failed to load OpenAPI spec: ${response.statusText}`);
          }
          data = await response.json() as OpenAPISpec;
        }

        // Ensure production server URL is set correctly
        // Note: Server URL should NOT include /api because paths already include /api prefix
        if (data.servers && Array.isArray(data.servers)) {
          // Update or add production server (without /api since paths include it)
          const hasProduction = data.servers.some((s) => s.url.includes('babylon.market'));
          if (!hasProduction) {
            data.servers.push({
              url: 'https://babylon.market',
              description: 'Production server'
            });
          } else {
            // Ensure production server doesn't have /api suffix (paths already include it)
            data.servers = data.servers.map((s) => {
              if (s.url.includes('babylon.market') && s.url.endsWith('/api')) {
                return { ...s, url: 'https://babylon.market' };
              }
              if (s.url === 'http://localhost:3000/api') {
                return { ...s, url: 'http://localhost:3000' };
              }
              return s;
            });
          }
          // Set production as default if available
          const productionIndex = data.servers.findIndex((s) => s.url.includes('babylon.market'));
          if (productionIndex > 0) {
            // Move production to first position
            const prod = data.servers.splice(productionIndex, 1)[0];
            data.servers.unshift(prod);
          }
        } else {
          data.servers = [
            {
              url: 'https://babylon.market',
              description: 'Production server'
            },
            {
              url: 'http://localhost:3000',
              description: 'Development server'
            }
          ];
        }

        setSwaggerSpec(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load API documentation');
        setLoading(false);
      }
    };

    loadSpec();
  }, [spec, url]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading API documentation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <h3>Error loading API documentation</h3>
        <p>{error}</p>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
          Make sure <code>openapi.json</code> exists in the public directory.
        </p>
      </div>
    );
  }

  if (!swaggerSpec) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No API specification available.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <SwaggerUIBundle
        spec={swaggerSpec}
        deepLinking={true}
        displayOperationId={false}
        defaultModelsExpandDepth={1}
        defaultModelExpandDepth={1}
        docExpansion="list"
        filter={true}
        showExtensions={true}
        showCommonExtensions={true}
        tryItOutEnabled={true}
        persistAuthorization={true}
        displayRequestDuration={true}
        showMutatedRequest={true}
        requestInterceptor={(request) => {
          // Swagger UI handles URL construction automatically based on server URL and path
          // Paths in OpenAPI spec already include /api prefix, so no modification needed
          return request;
        }}
        responseInterceptor={(response) => {
          return response;
        }}
      />
    </div>
  );
}
