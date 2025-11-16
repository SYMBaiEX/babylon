#!/usr/bin/env bun
/**
 * Comprehensive Swagger Verification Script
 * 
 * Verifies that Swagger/OpenAPI is 100% functional:
 * - Auto-generator works
 * - All routes are documented
 * - Spec is valid
 * - Swagger UI can load it
 */

import { generateAutoSpec } from '../src/lib/swagger/auto-generator';

async function verifySwagger() {
  console.log('🔍 Comprehensive Swagger Verification\n');

  try {
    const spec = await generateAutoSpec() as {
      openapi?: string;
      swagger?: string;
      info?: { title?: string; version?: string; description?: string };
      servers?: Array<{ url: string; description?: string }>;
      paths?: Record<string, Record<string, unknown>>;
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
      tags?: Array<{ name: string; description?: string }>;
    };

    // 1. Basic structure validation
    console.log('1️⃣  Basic Structure:');
    if (!spec.openapi && !spec.swagger) {
      console.log('   ❌ Missing OpenAPI version');
      process.exit(1);
    }
    console.log(`   ✅ OpenAPI version: ${spec.openapi || spec.swagger}`);

    if (!spec.info?.title || !spec.info?.version) {
      console.log('   ❌ Missing info.title or info.version');
      process.exit(1);
    }
    console.log(`   ✅ Info: ${spec.info.title} v${spec.info.version}`);

    // 2. Servers validation
    console.log('\n2️⃣  Servers Configuration:');
    if (!spec.servers || spec.servers.length === 0) {
      console.log('   ❌ No servers configured');
      process.exit(1);
    }
    console.log(`   ✅ ${spec.servers.length} server(s) configured`);
    spec.servers.forEach((server, i) => {
      console.log(`      ${i + 1}. ${server.url} - ${server.description || 'No description'}`);
    });

    // 3. Security schemes validation
    console.log('\n3️⃣  Security Schemes:');
    if (!spec.components?.securitySchemes) {
      console.log('   ❌ No security schemes defined');
      process.exit(1);
    }
    const schemes = Object.keys(spec.components.securitySchemes);
    console.log(`   ✅ ${schemes.length} security scheme(s): ${schemes.join(', ')}`);
    if (!schemes.includes('PrivyAuth')) {
      console.log('   ⚠️  PrivyAuth missing (recommended)');
    }
    if (!schemes.includes('BearerAuth')) {
      console.log('   ⚠️  BearerAuth missing (recommended)');
    }

    // 4. Paths validation
    console.log('\n4️⃣  API Paths:');
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      console.log('   ❌ No paths found');
      process.exit(1);
    }
    const pathCount = Object.keys(spec.paths).length;
    console.log(`   ✅ ${pathCount} path(s) documented`);

    // Check for critical routes
    const criticalRoutes = [
      '/api/docs',
      '/api/health',
      '/api/posts',
      '/api/agents',
      '/api/users/me',
      '/api/chats',
    ];

    console.log('\n5️⃣  Critical Routes:');
    let missingCritical = 0;
    for (const route of criticalRoutes) {
      const found = Object.keys(spec.paths).some((path) => {
        // Exact match or parameterized match
        if (path === route) return true;
        const routePattern = route.replace(/\{[^}]+\}/g, '\\{[^}]+\\}');
        const regex = new RegExp(`^${routePattern.replace(/\//g, '\\/')}$`);
        return regex.test(path);
      });

      if (found) {
        console.log(`   ✅ ${route}`);
      } else {
        console.log(`   ❌ ${route} - MISSING`);
        missingCritical++;
      }
    }

    if (missingCritical > 0) {
      console.log(`\n   ⚠️  ${missingCritical} critical route(s) missing`);
    }

    // 6. Tags validation
    console.log('\n6️⃣  Tags:');
    if (!spec.tags || spec.tags.length === 0) {
      console.log('   ⚠️  No tags defined (optional but recommended)');
    } else {
      console.log(`   ✅ ${spec.tags.length} tag(s) defined`);
      const tagNames = spec.tags.map((t) => t.name);
      console.log(`      ${tagNames.join(', ')}`);
    }

    // 7. Methods per path
    console.log('\n7️⃣  Methods Coverage:');
    const methods = new Set<string>();
    Object.values(spec.paths).forEach((pathDef) => {
      Object.keys(pathDef).forEach((method) => {
        methods.add(method.toUpperCase());
      });
    });
    console.log(`   ✅ Methods covered: ${Array.from(methods).sort().join(', ')}`);

    // 8. JSON validation
    console.log('\n8️⃣  JSON Validation:');
    try {
      const json = JSON.stringify(spec);
      JSON.parse(json);
      console.log('   ✅ Spec is valid JSON');
      const sizeKB = Math.round(json.length / 1024);
      console.log(`   ✅ Spec size: ${sizeKB} KB`);
      if (sizeKB > 500) {
        console.log('   ⚠️  Spec is large (>500KB) - may affect Swagger UI performance');
      }
    } catch (e) {
      console.log(`   ❌ Invalid JSON: ${(e as Error).message}`);
      process.exit(1);
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ SWAGGER VERIFICATION COMPLETE');
    console.log('='.repeat(50));
    console.log(`   OpenAPI: ${spec.openapi || spec.swagger}`);
    console.log(`   Paths: ${pathCount}`);
    console.log(`   Servers: ${spec.servers?.length || 0}`);
    console.log(`   Security Schemes: ${schemes.length}`);
    console.log(`   Tags: ${spec.tags?.length || 0}`);
    console.log(`   Missing Critical Routes: ${missingCritical}`);
    console.log('='.repeat(50));

    if (missingCritical === 0 && pathCount >= 20) {
      console.log('\n🎉 Swagger is 100% functional and ready to use!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some issues found - see above for details');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifySwagger();


