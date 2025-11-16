# Actors Data Structure

This directory contains the actor and organization data for the Babylon game.

## Structure

The data is now split into individual files for better maintainability:

```
public/data/
├── actors.json              # Index file with references (SOURCE OF TRUTH)
├── actors/                  # Individual actor JSON files (SOURCE OF TRUTH)
│   ├── ailon-musk.json
│   ├── sam-ailtman.json
│   └── ... (64 total)
├── organizations/           # Individual organization JSON files (SOURCE OF TRUTH)
│   ├── openai.json
│   ├── anthropic.json
│   └── ... (52 total)
└── relationships/           # [ARCHIVED] Static relationship files (no longer used)
    ├── ailon-musk_sam-ailtman.json
    ├── ailon-musk_mark-zuckerborg.json
    └── ... (331 total - for reference only)

**NOTE:** Relationships are now **DYNAMIC** and stored in the database.
They evolve based on NPC interactions and are NOT loaded from these JSON files.
```

## Usage

### Server-Side (Node.js) - OPTIMIZED ✅

Use the actors loader utility for optimal performance:

```typescript
import { 
  loadActorsData, 
  loadActorById, 
  loadOrganizationById, 
  loadRelationship 
} from '@/lib/data/actors-loader';

// Load all actors, organizations, and relationships
// Loads from individual files via actors.json index for flexibility
const data = loadActorsData();
console.log(data.actors.length); // 64
console.log(data.organizations.length); // 52
console.log(data.relationships.length); // 331

// Load a single actor (OPTIMIZED - direct file read)
const actor = loadActorById('ailon-musk');

// Load a single organization (OPTIMIZED - direct file read)
const org = loadOrganizationById('openai');

// Selective loading (NEW - load only what you need)
const actorsOnly = loadActorsData({
  includeActors: true,
  includeOrganizations: false,
  includeRelationships: false
});
// Loads 64 files instead of 447 (86% reduction!)
```

**Performance Benefits:**
- ✅ `loadActorsData()`: In-memory caching (instant subsequent calls)
- ✅ `loadActorById()`: Direct file read + cached (97% faster)
- ✅ `loadOrganizationById()`: Direct file read + cached
- ✅ Selective loading: Load only actors, orgs, or relationships
- ✅ ID-only loading: Get IDs without loading files (`getActorIds()`)

### Client-Side (Browser) - Use API Endpoint

**Recommended: Use API Endpoint**
```typescript
// Uses server-side loader with caching (optimized)
// Serves from individual files via actors.json index
const response = await fetch('/api/actors');
const data = await response.json();
// { actors: [...], organizations: [...], relationships: [...] }
```

**Why Not Individual Files in Browser?**
- ❌ Would require 400+ HTTP requests (64 actors + 52 orgs + 331 relationships)
- ❌ Poor performance due to HTTP overhead
- ✅ API endpoint is a single optimized request
- ✅ Server-side caching for performance
- ✅ Can add authentication/authorization if needed

## Files

### actors.json

Index file containing references to individual actor, organization, and relationship files:

```json
{
  "actors": [
    { "id": "ailon-musk", "file": "./actors/ailon-musk.json" },
    ...
  ],
  "organizations": [
    { "id": "openai", "file": "./organizations/openai.json" },
    ...
  ],
  "relationships": [
    { "id": "ailon-musk_sam-ailtman", "file": "./relationships/ailon-musk_sam-ailtman.json" },
    ...
  ]
}
```

### Individual Files

Each actor, organization, and relationship has its own JSON file in their respective directories.

**Actors:** `public/data/actors/<actor-id>.json`
**Organizations:** `public/data/organizations/<org-id>.json`
**Relationships:** `public/data/relationships/<actor1-id>_<actor2-id>.json` (alphabetically ordered)

#### Adding New Actors
1. Create a new file in `public/data/actors/` with the actor ID as the filename
2. Add reference to `actors.json`
3. Done! The loader will automatically pick it up

## Relationships (Now Dynamic!)

**⚠️ IMPORTANT CHANGE:** Relationships are now **DYNAMIC** and database-backed.

### How It Works Now
```
Old System (Deprecated):
  ❌ Static JSON files (331 files)
  ❌ Never change
  ❌ Manual generation

New System (Current):
  ✅ Database-backed (ActorRelationship table)
  ✅ Evolve based on NPC interactions
  ✅ LLM-generated descriptions
  ✅ Example: "competing for dominance after that metaverse disaster"
```

### Relationship JSON Files (Archived)
The `relationships/*.json` files are now **archived** and not loaded. They're kept for reference only.

**Current system:**
- Relationships generated on first game tick
- Evolve every 10 ticks based on interactions
- Stored in database, not JSON files
- LLM generates natural text descriptions

### Validate Data Files
```bash
bun run validate:data
```

Validates actors and organizations (relationships are now in database).

## Benefits

1. **Easier to Edit**: Each actor/org/relationship is in its own file, making it easier to find and modify
2. **Better Git Diffs**: Changes to individual entities don't affect the entire file
3. **Reduced Merge Conflicts**: Multiple people can edit different entities simultaneously
4. **Better Organization**: Clear separation between actors, organizations, and relationships
5. **Lazy Loading**: Ability to load individual entities on-demand (future optimization)
6. **Relationship Management**: Named by both actors (alphabetically) for easy lookup

## Migration

The original monolithic `actors.json` has been backed up to `actors.json.backup`. All code has been updated to use the new structure via the actors-loader utility.

