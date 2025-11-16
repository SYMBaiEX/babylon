#!/usr/bin/env bun
/**
 * Test Swagger/OpenAPI Generation
 * 
 * Verifies that the auto-generator works correctly and finds all documented routes
 */

import { generateAutoSpec } from '../src/lib/swagger/auto-generator';

async function testSwagger() {
  console.log('🧪 Testing Swagger Auto-Generator...\n');

  try {
    const spec = await generateAutoSpec() as {
      openapi?: string;
      paths?: Record<string, unknown>;
      info?: { title?: string; version?: string };
    };

    console.log('✅ Spec generated successfully');
    console.log(`   OpenAPI version: ${spec.openapi || 'missing'}`);
    console.log(`   Title: ${spec.info?.title || 'missing'}`);
    console.log(`   Version: ${spec.info?.version || 'missing'}`);
    console.log(`   Total paths: ${Object.keys(spec.paths || {}).length}\n`);

    const paths = Object.keys(spec.paths || {}).sort();
    console.log('📋 All paths found:');
    paths.forEach((path) => {
      const methods = Object.keys((spec.paths?.[path] as Record<string, unknown>) || {});
      console.log(`   ${path} [${methods.join(', ').toUpperCase()}]`);
    });

    console.log('\n🔍 Checking for expected routes:');
    const expectedRoutes = [
      '/api/docs',
      '/api/health',
      '/api/stats',
      '/api/posts',
      '/api/posts/{id}',
      '/api/posts/{id}/like',
      '/api/posts/{id}/comments',
      '/api/agents',
      '/api/agents/{agentId}',
      '/api/chats',
      '/api/chats/{id}',
      '/api/chats/dm',
      '/api/users/me',
      '/api/users/search',
      '/api/users/{userId}/profile',
      '/api/users/{userId}/follow',
      '/api/notifications',
      '/api/trades',
      '/api/markets/perps',
      '/api/a2a',
    ];

    const missing: string[] = [];
    const found: string[] = [];

    for (const route of expectedRoutes) {
      // Check both exact match and parameterized version
      const foundRoute = paths.find((p) => {
        // Exact match
        if (p === route) return true;
        // Parameterized match (e.g., {id} vs {agentId})
        const routePattern = route.replace(/\{[^}]+\}/g, '\\{[^}]+\\}');
        const regex = new RegExp(`^${routePattern.replace(/\//g, '\\/')}$`);
        return regex.test(p);
      });

      if (foundRoute) {
        found.push(route);
        console.log(`   ✅ ${route}`);
      } else {
        missing.push(route);
        console.log(`   ❌ ${route} - NOT FOUND`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Found: ${found.length}/${expectedRoutes.length}`);
    console.log(`   Missing: ${missing.length}/${expectedRoutes.length}`);

    if (missing.length > 0) {
      console.log(`\n⚠️  Missing routes:`);
      missing.forEach((route) => console.log(`   - ${route}`));
      console.log('\n💡 These routes may need @openapi tags or have formatting issues.');
      process.exit(1);
    } else {
      console.log('\n✅ All expected routes found!');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error generating spec:', error);
    process.exit(1);
  }
}

testSwagger();

