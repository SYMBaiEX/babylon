#!/usr/bin/env bun
/**
 * Route Documentation Helper
 * 
 * Identifies routes missing @openapi tags and helps track documentation progress
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function findRoutes(dir: string): Promise<string[]> {
  const routes: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      routes.push(...await findRoutes(fullPath));
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      routes.push(fullPath);
    }
  }
  
  return routes;
}

async function checkRoute(routePath: string): Promise<{ hasOpenapi: boolean; hasTsdoc: boolean; methods: string[] }> {
  const content = await readFile(routePath, 'utf-8');
  const hasOpenapi = content.includes('@openapi');
  const hasTsdoc = content.includes('/**') && content.includes('@description');
  
  const methods: string[] = [];
  if (content.includes('export async function GET') || content.includes('export const GET')) methods.push('GET');
  if (content.includes('export async function POST') || content.includes('export const POST')) methods.push('POST');
  if (content.includes('export async function PUT') || content.includes('export const PUT')) methods.push('PUT');
  if (content.includes('export async function PATCH') || content.includes('export const PATCH')) methods.push('PATCH');
  if (content.includes('export async function DELETE') || content.includes('export const DELETE')) methods.push('DELETE');
  
  return { hasOpenapi, hasTsdoc, methods };
}

async function main() {
  const apiDir = join(process.cwd(), 'src/app/api');
  const routes = await findRoutes(apiDir);
  
  console.log(`Found ${routes.length} route files\n`);
  
  const missing: string[] = [];
  const documented: string[] = [];
  
  for (const route of routes) {
    const { hasOpenapi, hasTsdoc, methods } = await checkRoute(route);
    const relPath = route.replace(process.cwd() + '/', '');
    
    if (!hasOpenapi) {
      missing.push(relPath);
      console.log(`❌ ${relPath} [${methods.join(', ')}] - Missing @openapi`);
    } else {
      documented.push(relPath);
      const tsdocStatus = hasTsdoc ? '✅' : '⚠️';
      console.log(`${tsdocStatus} ${relPath} [${methods.join(', ')}] - Has @openapi`);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Documented: ${documented.length}/${routes.length}`);
  console.log(`   Missing: ${missing.length}/${routes.length}`);
  
  if (missing.length > 0) {
    console.log(`\n⚠️  Missing routes (first 20):`);
    missing.slice(0, 20).forEach(r => console.log(`   - ${r}`));
  }
}

main().catch(console.error);
