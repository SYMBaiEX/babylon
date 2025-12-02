// Type declarations for swagger-ui-react
declare module 'swagger-ui-react' {
  import type { ComponentType } from 'react';

  interface SwaggerUIProps {
    spec?: object;
    url?: string;
    deepLinking?: boolean;
    displayOperationId?: boolean;
    defaultModelsExpandDepth?: number;
    defaultModelExpandDepth?: number;
    docExpansion?: 'list' | 'full' | 'none';
    filter?: boolean | string;
    showExtensions?: boolean;
    showCommonExtensions?: boolean;
    tryItOutEnabled?: boolean;
    persistAuthorization?: boolean;
    displayRequestDuration?: boolean;
    showMutatedRequest?: boolean;
    requestInterceptor?: (request: Request) => Request;
    responseInterceptor?: (response: Response) => Response;
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}

// Type declarations for MDX
declare module 'mdx/types' {
  export type MDXComponents = Record<string, unknown>;
}

// Type declarations for SVG imports
declare module '*.svg' {
  const content: string;
  export default content;
}
