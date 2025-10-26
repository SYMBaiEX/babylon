#!/usr/bin/env bun
/**
 * Validate actors.json
 * - Ensures all actor affiliations reference valid organizations
 * - Checks for required fields
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface Actor {
  id: string;
  name: string;
  realName?: string;
  username?: string;
  affiliations: string[];
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface ActorsData {
  actors: Actor[];
  organizations: Organization[];
}

function validateActors(): void {
  const actorsPath = join(process.cwd(), 'data', 'actors.json');
  const data: ActorsData = JSON.parse(readFileSync(actorsPath, 'utf-8'));

  const { actors, organizations } = data;
  
  // Build a set of valid organization IDs
  const validOrgIds = new Set(organizations.map(org => org.id));
  
  console.log(`📊 Validating ${actors.length} actors against ${organizations.length} organizations...`);
  console.log('');

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check each actor
  for (const actor of actors) {
    // Check required fields
    if (!actor.realName) {
      warnings.push(`⚠️  ${actor.name} (${actor.id}) missing 'realName' field`);
    }
    if (!actor.username) {
      warnings.push(`⚠️  ${actor.name} (${actor.id}) missing 'username' field`);
    }

    // Check affiliations
    if (!actor.affiliations || actor.affiliations.length === 0) {
      // Some actors might not have affiliations (like independent actors)
      continue;
    }

    for (const affiliation of actor.affiliations) {
      if (!validOrgIds.has(affiliation)) {
        errors.push(
          `❌ ${actor.name} (${actor.id}) has invalid affiliation: "${affiliation}"`
        );
      }
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    warnings.forEach(w => console.log(w));
    console.log('');
  }

  // Print errors
  if (errors.length > 0) {
    console.log('❌ VALIDATION ERRORS:');
    errors.forEach(e => console.log(e));
    console.log('');
    console.log(`Found ${errors.length} error(s)`);
    process.exit(1);
  }

  // Success!
  console.log('✅ All actor affiliations are valid!');
  console.log(`   - ${actors.length} actors checked`);
  console.log(`   - ${organizations.length} organizations verified`);
  
  if (warnings.length > 0) {
    console.log(`   - ${warnings.length} warning(s) (non-blocking)`);
  }
}

// Run validation
validateActors();
