#!/usr/bin/env bun
/**
 * Comprehensive Route Documentation Verification
 * 
 * Verifies that ALL route files have @openapi tags and checks for parsing issues
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { generateAutoSpec } from '../src/lib/swagger/auto-generator';

interface RouteInfo {
  path: string;
  hasOpenapi: boolean;
  hasExport: boolean;
  methods: string[];
  openapiPath?: string;
}

async function findRouteFiles(dir: string, files: RouteInfo[] = []): Promise<RouteInfo[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await findRouteFiles(fullPath, files);
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      const content = await readFile(fullPath, 'utf-8');
      const hasOpenapi = content.includes('@openapi');
      const hasExport = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)/.test(content);
      
      // Extract methods
      const methods: string[] = [];
      if (content.includes('export async function GET') || content.includes('export const GET')) methods.push('GET');
      if (content.includes('export async function POST') || content.includes('export const POST')) methods.push('POST');
      if (content.includes('export async function PUT') || content.includes('export const PUT')) methods.push('PUT');
      if (content.includes('export async function PATCH') || content.includes('export const PATCH')) methods.push('PATCH');
      if (content.includes('export async function DELETE') || content.includes('export const DELETE')) methods.push('DELETE');
      
      // Extract OpenAPI path from @openapi block
      const openapiMatch = content.match(/@openapi\s*\n\s*\*\s*(\/[^:]+):/);
      const openapiPath = openapiMatch ? openapiMatch[1] : undefined;
      
      files.push({
        path: fullPath,
        hasOpenapi,
        hasExport,
        methods,
        openapiPath,
      });
    }
  }
  
  return files;
}

async function main() {
  console.log('🔍 Comprehensive Route Documentation Check\n');
  
  const apiDir = join(process.cwd(), 'src/app/api');
  const routes = await findRouteFiles(apiDir);
  
  console.log(`📊 Found ${routes.length} route files\n`);
  
  // Check for routes without @openapi tags
  const missingDocs = routes.filter(r => r.hasExport && !r.hasOpenapi);
  if (missingDocs.length > 0) {
    console.log('❌ Routes missing @openapi tags:');
    missingDocs.forEach(r => {
      console.log(`   ${r.path}`);
      console.log(`      Methods: ${r.methods.join(', ') || 'none'}`);
    });
    console.log('');
  } else {
    console.log('✅ All routes have @openapi tags\n');
  }
  
  // Check for routes with @openapi but no exports (dead code)
  const deadRoutes = routes.filter(r => r.hasOpenapi && !r.hasExport);
  if (deadRoutes.length > 0) {
    console.log('⚠️  Routes with @openapi but no exports (dead code?):');
    deadRoutes.forEach(r => console.log(`   ${r.path}`));
    console.log('');
  }
  
  // Get generated spec
  const spec = await generateAutoSpec() as { paths?: Record<string, unknown> };
  const documentedPaths = Object.keys(spec.paths || {});
  
  console.log(`📋 Generated spec has ${documentedPaths.length} paths\n`);
  
  // Check which routes have OpenAPI paths defined
  const routesWithPaths = routes.filter(r => r.openapiPath);
  console.log(`📝 Routes with OpenAPI path definitions: ${routesWithPaths.length}`);
  
  // Check for routes that might not be parsed
  const routesNotInSpec = routes.filter(r => {
    if (!r.openapiPath) return false;
    // Convert file path to API path
    const apiPath = r.openapiPath;
    return !documentedPaths.some(dp => dp === apiPath || dp.replace(/\{[^}]+\}/g, '{}') === apiPath.replace(/\{[^}]+\}/g, '{}'));
  });
  
  if (routesNotInSpec.length > 0) {
    console.log('\n⚠️  Routes with @openapi tags that might not be in spec:');
    routesNotInSpec.forEach(r => {
      console.log(`   ${r.path}`);
      console.log(`      OpenAPI path: ${r.openapiPath}`);
      console.log(`      Methods: ${r.methods.join(', ')}`);
    });
  } else {
    console.log('\n✅ All routes with @openapi tags appear to be in spec');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total route files: ${routes.length}`);
  console.log(`Routes with @openapi tags: ${routes.filter(r => r.hasOpenapi).length}`);
  console.log(`Routes with exports: ${routes.filter(r => r.hasExport).length}`);
  console.log(`Paths in generated spec: ${documentedPaths.length}`);
  console.log(`Routes missing documentation: ${missingDocs.length}`);
  console.log('='.repeat(60));
  
  if (missingDocs.length > 0) {
    process.exit(1);
  }
}

main().catch(console.error);

