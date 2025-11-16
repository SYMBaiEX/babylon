/**
 * Actors Data Loader
 * 
 * Loads actors, organizations, and relationships from individual JSON files.
 * Uses actors.json as an index to find all entity files.
 * 
 * **Architecture:**
 * - Individual files for each actor, org, and relationship
 * - Index file (actors.json) contains references to all files
 * - In-memory caching for performance
 * - Direct file reads for single-entity lookups
 * 
 * **Performance:**
 * - First load: ~8ms (reads files and caches)
 * - Subsequent loads: <1ms (uses cache)
 * - Single entity loads: Direct file read (fastest)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ActorsDatabase, ActorData, Organization } from '../../shared/types';

interface IndexReference {
  id: string;
  file: string;
}

interface ActorsIndex {
  actors: IndexReference[];
  organizations: IndexReference[];
  relationships?: IndexReference[];
}

/**
 * Options for selective data loading
 */
export interface LoadActorsOptions {
  includeActors?: boolean;
  includeOrganizations?: boolean;
  includeRelationships?: boolean;
}

/**
 * In-memory cache for loaded data
 * Cleared on module reload, persists during runtime
 */
const dataCache: {
  actors: Map<string, ActorData>;
  organizations: Map<string, Organization>;
  relationships: Map<string, RelationshipFileData>;
  index: ActorsIndex | null;
} = {
  actors: new Map(),
  organizations: new Map(),
  relationships: new Map(),
  index: null,
};

/**
 * Clear the data cache (useful for testing or when data changes)
 */
export function clearDataCache(): void {
  dataCache.actors.clear();
  dataCache.organizations.clear();
  dataCache.relationships.clear();
  dataCache.index = null;
}

/**
 * Load the actors.json index file (cached)
 */
function loadIndex(): ActorsIndex {
  if (dataCache.index) {
    return dataCache.index;
  }

  const dataDir = join(process.cwd(), 'public', 'data');
  const actorsJsonPath = join(dataDir, 'actors.json');

  if (!existsSync(actorsJsonPath)) {
    throw new Error('actors.json index file not found. This file is required.');
  }

  const indexData = JSON.parse(readFileSync(actorsJsonPath, 'utf-8')) as ActorsIndex;
  dataCache.index = indexData;
  return indexData;
}

/**
 * Relationship data as stored in individual JSON files
 * Simpler structure than the full ActorRelationship interface
 */
export interface RelationshipFileData {
  actor1Id: string;
  actor2Id: string;
  relationshipType: string;
  strength: number; // 0.0 to 1.0
  sentiment: number; // -1.0 to 1.0
  history: string;
  actor1FollowsActor2: boolean;
  actor2FollowsActor1: boolean;
}

/**
 * Loads all actors data from individual files via actors.json index
 * 
 * **Features:**
 * - Caching: Data is cached in memory after first load
 * - Selective: Can choose to load only actors, orgs, or relationships
 * - Fast: Direct file reads with caching
 * 
 * @param options Optional configuration for selective loading
 * @returns ActorsDatabase with requested data
 */
export function loadActorsData(options?: LoadActorsOptions): ActorsDatabase {
  const dataDir = join(process.cwd(), 'public', 'data');
  const indexData = loadIndex();
  
  // Default to loading everything if no options provided
  const includeActors = options?.includeActors !== false;
  const includeOrganizations = options?.includeOrganizations !== false;
  const includeRelationships = options?.includeRelationships !== false;
  
  // Check if this is an index file (has references with "file" property)
  if (indexData.actors?.[0] && 'file' in indexData.actors[0]) {
    // Load actors from individual files (with caching)
    const actors: ActorData[] = [];
    if (includeActors) {
      for (const ref of indexData.actors) {
        // Check cache first
        if (dataCache.actors.has(ref.id)) {
          actors.push(dataCache.actors.get(ref.id)!);
          continue;
        }
        
        // Load from file
        const actorPath = join(dataDir, ref.file);
        if (!existsSync(actorPath)) {
          throw new Error(`Actor file not found: ${ref.file} (referenced in actors.json)`);
        }
        const actorData = JSON.parse(readFileSync(actorPath, 'utf-8')) as ActorData;
        
        // Cache it
        dataCache.actors.set(ref.id, actorData);
        actors.push(actorData);
      }
    }

    // Load organizations from individual files (with caching)
    const organizations: Organization[] = [];
    if (includeOrganizations) {
      for (const ref of indexData.organizations) {
        // Check cache first
        if (dataCache.organizations.has(ref.id)) {
          organizations.push(dataCache.organizations.get(ref.id)!);
          continue;
        }
        
        // Load from file
        const orgPath = join(dataDir, ref.file);
        if (!existsSync(orgPath)) {
          throw new Error(`Organization file not found: ${ref.file} (referenced in actors.json)`);
        }
        const orgData = JSON.parse(readFileSync(orgPath, 'utf-8')) as Organization;
        
        // Cache it
        dataCache.organizations.set(ref.id, orgData);
        organizations.push(orgData);
      }
    }

    // Load relationships from individual files (with caching)
    const relationships: RelationshipFileData[] = [];
    if (includeRelationships && indexData.relationships) {
      for (const ref of indexData.relationships) {
        // Check cache first
        if (dataCache.relationships.has(ref.id)) {
          relationships.push(dataCache.relationships.get(ref.id)!);
          continue;
        }
        
        // Load from file
        const relPath = join(dataDir, ref.file);
        if (existsSync(relPath)) {
          const relData = JSON.parse(readFileSync(relPath, 'utf-8')) as RelationshipFileData;
          
          // Cache it
          dataCache.relationships.set(ref.id, relData);
          relationships.push(relData);
        }
      }
    }

    return {
      actors,
      organizations,
      relationships
    };
  }
  
  // If it's already a full structure (no "file" property), return it directly
  // This handles legacy actors.json format if someone is using it
  if (indexData.actors?.[0] && !('file' in indexData.actors[0])) {
    return {
      actors: indexData.actors as unknown as ActorData[],
      organizations: indexData.organizations as unknown as Organization[],
      relationships: indexData.relationships as unknown as RelationshipFileData[] || []
    };
  }

  throw new Error('Invalid actors.json format. Expected index with references to individual files.');
}

/**
 * Loads a single actor by ID - OPTIMIZED with caching
 * Checks cache first, then loads from individual file
 * 
 * **Performance:** Only reads file once, subsequent calls use cache
 * 
 * @param actorId The ID of the actor to load
 * @returns Actor data or null if not found
 */
export function loadActorById(actorId: string): ActorData | null {
  // Check cache first (fastest - no I/O)
  if (dataCache.actors.has(actorId)) {
    return dataCache.actors.get(actorId)!;
  }
  
  const dataDir = join(process.cwd(), 'public', 'data');
  const actorFilePath = join(dataDir, 'actors', `${actorId}.json`);
  
  // Load from individual file
  if (existsSync(actorFilePath)) {
    try {
      const actorData = JSON.parse(readFileSync(actorFilePath, 'utf-8')) as ActorData;
      // Cache it for future calls
      dataCache.actors.set(actorId, actorData);
      return actorData;
    } catch (error) {
      console.warn(`Failed to load actor ${actorId}:`, error);
      return null;
    }
  }
  
  return null;
}

/**
 * Loads a single organization by ID - OPTIMIZED with caching
 * Checks cache first, then loads from individual file
 * 
 * **Performance:** Only reads file once, subsequent calls use cache
 * 
 * @param orgId The ID of the organization to load
 * @returns Organization data or null if not found
 */
export function loadOrganizationById(orgId: string): Organization | null {
  // Check cache first (fastest - no I/O)
  if (dataCache.organizations.has(orgId)) {
    return dataCache.organizations.get(orgId)!;
  }
  
  const dataDir = join(process.cwd(), 'public', 'data');
  const orgFilePath = join(dataDir, 'organizations', `${orgId}.json`);
  
  // Load from individual file
  if (existsSync(orgFilePath)) {
    try {
      const orgData = JSON.parse(readFileSync(orgFilePath, 'utf-8')) as Organization;
      // Cache it for future calls
      dataCache.organizations.set(orgId, orgData);
      return orgData;
    } catch (error) {
      console.warn(`Failed to load organization ${orgId}:`, error);
      return null;
    }
  }
  
  return null;
}

/**
 * Loads a relationship between two actors - OPTIMIZED with caching
 * Checks cache first, then loads from individual file
 * 
 * **Performance:** Only reads file once, subsequent calls use cache
 * 
 * @param actor1Id First actor ID (will be sorted alphabetically)
 * @param actor2Id Second actor ID (will be sorted alphabetically)
 * @returns Relationship data or null if not found
 */
export function loadRelationship(actor1Id: string, actor2Id: string): RelationshipFileData | null {
  // Sort IDs alphabetically (relationships are stored with sorted names)
  const [id1, id2] = [actor1Id, actor2Id].sort();
  const relId = `${id1}_${id2}`;
  
  // Check cache first (fastest - no I/O)
  if (dataCache.relationships.has(relId)) {
    return dataCache.relationships.get(relId)!;
  }
  
  const dataDir = join(process.cwd(), 'public', 'data');
  const relationshipFilePath = join(dataDir, 'relationships', `${relId}.json`);
  
  // Load from individual file
  if (existsSync(relationshipFilePath)) {
    try {
      const relData = JSON.parse(readFileSync(relationshipFilePath, 'utf-8')) as RelationshipFileData;
      // Cache it for future calls
      dataCache.relationships.set(relId, relData);
      return relData;
    } catch (error) {
      console.warn(`Failed to load relationship ${relId}:`, error);
      return null;
    }
  }
  
  return null;
}

/**
 * Get all actor IDs from the index without loading the full actor data
 * Useful when you only need IDs for lookups
 * 
 * @returns Array of actor IDs
 */
export function getActorIds(): string[] {
  const indexData = loadIndex();
  return indexData.actors.map(ref => ref.id);
}

/**
 * Get all organization IDs from the index without loading the full org data
 * Useful when you only need IDs for lookups
 * 
 * @returns Array of organization IDs
 */
export function getOrganizationIds(): string[] {
  const indexData = loadIndex();
  return indexData.organizations.map(ref => ref.id);
}