#!/usr/bin/env bun
/**
 * Validate actors.json
 * - Ensures all actor affiliations reference valid organizations
 * - Checks for required fields
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  realName: z.string().optional(),
  username: z.string().optional(),
  affiliations: z.array(z.string()),
});

const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
});

const ActorsDataSchema = z.object({
  actors: z.array(ActorSchema),
  organizations: z.array(OrganizationSchema),
});

function validateActors(): void {
  const actorsPath = join(process.cwd(), 'public', 'data', 'actors.json');
  const data = ActorsDataSchema.parse(JSON.parse(readFileSync(actorsPath, 'utf-8')));

  const { actors, organizations } = data;
  
  // Build a set of valid organization IDs
  const validOrgIds = new Set(organizations.map(org => org.id));
  
  logger.info(`Validating ${actors.length} actors against ${organizations.length} organizations...`, undefined, 'CLI');

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
    logger.warn('WARNINGS:', warnings, 'CLI');
  }

  // Print errors
  if (errors.length > 0) {
    logger.error('VALIDATION ERRORS:', errors, 'CLI');
    logger.error(`Found ${errors.length} error(s)`, undefined, 'CLI');
    process.exit(1);
  }

  // Success!
  logger.info('All actor affiliations are valid!', {
    actorsChecked: actors.length,
    organizationsVerified: organizations.length,
    warnings: warnings.length
  }, 'CLI');
}

// Run validation
validateActors();
