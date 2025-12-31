# NFT Gallery Page - Implementation Plan

**Linear Issue**: [BAB-85](https://linear.app/eliza-labs/issue/BAB-85/nft-gallery-page-display-collection-with-metadata-and-stories)  
**Related Issue**: [BAB-66 - NFT Drop Technical Setup](https://linear.app/eliza-labs/issue/BAB-66/nft-drop-technical-setup-mainnet-ethereum)  
**Assignee**: Puncar  
**Priority**: Medium  
**Status**: Planning Phase  
**Created**: 2025-12-31  
**Last Updated**: 2025-12-31  

---

## ✅ Key Decisions (Resolved)

| Decision | Resolution | Date |
|----------|------------|------|
| **Image Resolution** | 4096x4096 - requires thumbnail generation (256px, 512px, 1024px) | 2025-12-31 |
| **Stories/Metadata** | Product owner (Puncar) will provide all stories and metadata | 2025-12-31 |
| **Gallery Access** | **PUBLIC** - no authentication required to view gallery | 2025-12-31 |
| **Rarity Scores** | **NO** - no rarity scoring system | 2025-12-31 |
| **Real-time Ownership** | **YES** - real-time owner updates required (webhooks/indexer) | 2025-12-31 |
| **Navigation** | **NOT in sidebar** - links from mainpage and leaderboard page only | 2025-12-31 |
| **Contract Strategy** | Use placeholder contracts; 100 NFTs uploaded when frontend ready | 2025-12-31 |

---

## 1. Executive Summary

### 1.1 Goal

Create a dedicated NFT Gallery page within Babylon.market (`/nft` or `/collection`) to showcase the NFT collection distributed to the Top 100 leaderboard users. The gallery will display high-quality artwork, unique stories/lore, and complete metadata for each NFT in the collection.

### 1.2 Why This Matters

- **Community Engagement**: Provides a visual showcase for NFT holders and aspirational content for non-holders
- **Transparency**: Publicly displays the full collection with provenance information
- **Storytelling**: Each NFT has unique lore that enriches the Babylon universe
- **Discoverability**: Users can browse, filter, and explore the collection
- **Ownership Recognition**: Displays current owners of claimed NFTs

### 1.3 Success Criteria

- [ ] Gallery page accessible at `/nft` within Babylon.market
- [ ] **PUBLIC access** - no login required to view gallery
- [ ] All 100 NFTs displayed with optimized thumbnails (from 4096x4096 originals)
- [ ] Each NFT has readable story/lore content
- [ ] Metadata displayed clearly (name, description, traits, token ID)
- [ ] **Real-time owner updates** - ownership reflects current on-chain state
- [ ] Owner information shown for claimed NFTs
- [ ] Mobile responsive design
- [ ] Page loads in <3 seconds (LCP)
- [ ] Consistent with Babylon.market design system
- [ ] Links from **mainpage** and **leaderboard page** (NOT in sidebar)

---

## 2. Constraints & Dependencies

### 2.1 Hard Dependencies (Must Exist Before Implementation)

| Dependency | Description | Status | Blocker |
|------------|-------------|--------|---------|
| BAB-66 NFT Contract | ERC721 contract deployed (can use **placeholder** initially) | Backlog | **No - use placeholder** |
| NFT Artwork | 100 images at 4096x4096 resolution | **Puncar providing** | No - upload when ready |
| NFT Metadata | JSON metadata for each NFT with name, description, traits | **Puncar providing** | No - upload when ready |
| NFT Stories | Written lore/backstory for each NFT | **Puncar providing** | No - upload when ready |
| IPFS/Arweave Setup | Metadata storage system from BAB-66 | Backlog | Yes - for image URLs |

> **Note**: Frontend can be built with placeholder data. Puncar will upload all 100 NFTs when the frontend is ready.

### 2.2 Soft Dependencies

| Dependency | Description | Impact if Missing |
|------------|-------------|-------------------|
| NFT Claim System | Claim flow from BAB-66 | Owner info will be blank |
| Leaderboard Snapshot | Top 100 eligible users | Can't link to claim eligibility |
| Analytics | PostHog integration | No usage tracking |

### 2.3 Technical Constraints

- **Framework**: Next.js 14 App Router (existing pattern in `apps/web/src/app/`)
- **Styling**: TailwindCSS with existing design system tokens
- **State Management**: React hooks + optional Zustand stores
- **API Pattern**: Route handlers in `apps/web/src/app/api/`
- **Database**: Drizzle ORM with PostgreSQL
- **Image Optimization**: See Section 2.4 below
- **Authentication**: Privy (for owner verification features)
- **Access Control**: **PUBLIC** - no authentication required

### 2.4 Image Optimization Strategy (4096x4096 Source)

Since source images are 4096x4096, we need aggressive optimization:

**Pre-generated Thumbnails** (recommended):
| Size | Purpose | Format |
|------|---------|--------|
| 256x256 | Grid thumbnail | WebP |
| 512x512 | Hover preview | WebP |
| 1024x1024 | Medium detail | WebP |
| 4096x4096 | Full resolution (on-demand) | Original PNG |

**Implementation Options**:

1. **Pre-process during upload** (Recommended)
   - Generate all thumbnails when NFTs are uploaded
   - Store alongside originals on IPFS
   - Fastest load times

2. **CDN with on-the-fly resizing**
   - Use Cloudflare Images or imgix
   - Transform URLs: `?width=256&format=webp`
   - More flexible, slightly slower

3. **Next.js Image component**
   - Built-in optimization
   - Requires `remotePatterns` config for IPFS gateway
   - Good for fallback

**Recommended**: Option 1 (pre-process) with Option 3 as fallback

---

## 3. Architecture & Data Flow

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  /nft (Gallery Page)          │  /nft/[tokenId] (Detail Page)   │
│  - Grid view of all NFTs      │  - Full artwork display          │
│  - Filter/sort controls       │  - Complete metadata             │
│  - Lazy loading               │  - Story/lore content            │
│  - Thumbnail previews         │  - Owner information             │
└───────────────┬───────────────┴──────────────┬──────────────────┘
                │                              │
                ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Layer (Route Handlers)                    │
├─────────────────────────────────────────────────────────────────┤
│  GET /api/nft/collection      │  GET /api/nft/[tokenId]         │
│  - Returns all NFT summaries  │  - Returns single NFT details   │
│  - Supports pagination        │  - Includes owner data          │
│  - Supports filtering         │  - Fetches from IPFS if needed  │
└───────────────┬───────────────┴──────────────┬──────────────────┘
                │                              │
                ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Data Sources                              │
├──────────────────┬───────────────────┬──────────────────────────┤
│   PostgreSQL     │   IPFS Gateway    │   Smart Contract         │
│   (nft_claims,   │   (metadata,      │   (ownership via         │
│   nft_metadata   │   images)         │   events/subgraph)       │
│   cache)         │                   │                          │
└──────────────────┴───────────────────┴──────────────────────────┘
```

### 3.2 Data Flow

1. **Initial Page Load**:
   - Gallery page fetches `/api/nft/collection?page=1&limit=20`
   - API returns NFT summaries from local database cache
   - If cache miss, fetch from IPFS and populate cache
   - Images load lazily via Next.js `Image` with IPFS gateway

2. **NFT Detail View**:
   - Click on NFT → Navigate to `/nft/[tokenId]`
   - Fetch full metadata including story
   - Display owner info from `nft_claims` table or contract query

3. **Ownership Updates**:
   - Background job syncs ownership from contract events
   - Or real-time via webhook from indexer (if available)

### 3.3 Database Schema Extension

```sql
-- New table: nft_collection (cache for NFT metadata)
CREATE TABLE "NftCollection" (
  "id" TEXT PRIMARY KEY DEFAULT nanoid(),
  "tokenId" INTEGER UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT NOT NULL,           -- IPFS gateway URL (full resolution)
  "thumbnailUrl" TEXT,                -- Pre-generated thumbnail URL
  "imageCid" TEXT,                    -- Original IPFS CID
  "storyTitle" TEXT,
  "storyContent" TEXT,                -- Full lore/backstory (markdown supported)
  "metadataUri" TEXT,                 -- Full metadata IPFS URI
  "attributes" JSONB,                 -- Trait array: [{trait_type, value}]
  "contractAddress" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL DEFAULT 1,  -- Ethereum mainnet
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- New table: nft_ownership (real-time ownership tracking)
CREATE TABLE "NftOwnership" (
  "id" TEXT PRIMARY KEY DEFAULT nanoid(),
  "tokenId" INTEGER NOT NULL REFERENCES "NftCollection"("tokenId"),
  "ownerAddress" TEXT NOT NULL,       -- Current owner wallet address
  "userId" TEXT REFERENCES "User"("id"), -- Linked Babylon user (if known)
  "acquiredAt" TIMESTAMP NOT NULL,    -- When ownership was acquired
  "txHash" TEXT,                      -- Transaction hash of transfer
  "blockNumber" BIGINT,               -- Block number for ordering
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE("tokenId")
);

-- New table: nft_claims (tracks original claim from top 100)
CREATE TABLE "NftClaim" (
  "id" TEXT PRIMARY KEY DEFAULT nanoid(),
  "tokenId" INTEGER NOT NULL REFERENCES "NftCollection"("tokenId"),
  "claimerUserId" TEXT REFERENCES "User"("id"),
  "claimerAddress" TEXT NOT NULL,
  "claimedAt" TIMESTAMP NOT NULL,
  "txHash" TEXT NOT NULL,
  "snapshotRank" INTEGER,             -- User's rank at snapshot time
  "snapshotPoints" INTEGER,           -- User's points at snapshot time
  UNIQUE("tokenId")
);

-- Indexes for real-time queries
CREATE INDEX "NftOwnership_ownerAddress_idx" ON "NftOwnership"("ownerAddress");
CREATE INDEX "NftOwnership_userId_idx" ON "NftOwnership"("userId");
CREATE INDEX "NftOwnership_updatedAt_idx" ON "NftOwnership"("updatedAt");
CREATE INDEX "NftClaim_claimerUserId_idx" ON "NftClaim"("claimerUserId");
CREATE INDEX "NftClaim_claimerAddress_idx" ON "NftClaim"("claimerAddress");
```

### 3.4 Real-Time Ownership Sync

Since real-time ownership updates are required, implement one of these approaches:

**Option A: Blockchain Indexer (Recommended)**
- Use Alchemy/QuickNode webhooks for Transfer events
- API endpoint: `POST /api/nft/webhook/transfer`
- Updates `NftOwnership` table on each transfer

**Option B: Polling with Subgraph**
- Query The Graph subgraph every 30-60 seconds
- Background job updates ownership table

**Option C: On-Demand Verification**
- Check on-chain ownership when NFT detail page loads
- Cache result with short TTL (1 minute)

---

## 4. Component Architecture

### 4.1 File Structure

```
apps/web/src/
├── app/
│   └── nft/
│       ├── page.tsx                    # Gallery page (main grid view)
│       ├── loading.tsx                 # Loading skeleton
│       ├── [tokenId]/
│       │   ├── page.tsx                # NFT detail page
│       │   └── loading.tsx
│       └── components/
│           ├── NFTCard.tsx             # Grid item component
│           ├── NFTGrid.tsx             # Responsive grid layout
│           ├── NFTFilters.tsx          # Filter/sort controls
│           ├── NFTDetailView.tsx       # Full detail display
│           ├── NFTStorySection.tsx     # Story/lore display
│           ├── NFTAttributeList.tsx    # Traits display
│           ├── NFTOwnerBadge.tsx       # Owner info display
│           └── NFTGallerySkeleton.tsx  # Loading states
├── app/api/nft/
│   ├── collection/
│   │   └── route.ts                    # GET /api/nft/collection
│   └── [tokenId]/
│       └── route.ts                    # GET /api/nft/[tokenId]
├── hooks/
│   └── useNFTCollection.ts             # Data fetching hook
└── types/
    └── nft.ts                          # NFT type definitions
```

### 4.2 Component Specifications

#### NFTCard.tsx
```typescript
interface NFTCardProps {
  tokenId: number;
  name: string;
  imageUrl: string;
  rarityRank?: number;
  owner?: {
    id: string;
    username: string | null;
    displayName: string | null;
  } | null;
  onClick?: () => void;
}
```

**Behavior**:
- Displays thumbnail (aspect-ratio: 1:1)
- Shows name, rarity badge, owner avatar (if claimed)
- Hover: subtle scale/glow effect
- Click: navigates to detail page
- Lazy loads image

#### NFTGrid.tsx
```typescript
interface NFTGridProps {
  nfts: NFTSummary[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}
```

**Behavior**:
- Responsive grid: 2 cols (mobile), 3 cols (tablet), 4-5 cols (desktop)
- Infinite scroll or "Load More" button
- Masonry or uniform grid layout

#### NFTFilters.tsx
```typescript
interface NFTFiltersProps {
  onFilterChange: (filters: NFTFilters) => void;
  onSortChange: (sort: NFTSort) => void;
  traitOptions: TraitOption[];
}
```

**Filter Options**:
- Claimed / Unclaimed
- Trait filters (dropdown per trait type)
- Search by name/token ID

**Sort Options**:
- Rarity (high to low)
- Token ID
- Recently Claimed
- Alphabetical

---

## 5. API Specifications

### 5.1 GET /api/nft/collection

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| sort | string | "tokenId" | Sort field: tokenId, name, claimed |
| order | string | "asc" | Sort order: asc, desc |
| claimed | boolean | - | Filter by claim status |
| trait | string | - | Filter by trait (format: "traitType:value") |
| search | string | - | Search by name or token ID |

**Response**:
```json
{
  "success": true,
  "data": {
    "nfts": [
      {
        "tokenId": 1,
        "name": "Babylon Guardian #1",
        "thumbnailUrl": "https://ipfs.io/ipfs/.../thumb_256.webp",
        "imageUrl": "https://ipfs.io/ipfs/.../full.png",
        "owner": {
          "id": "user_123",
          "username": "prophecy_trader",
          "displayName": "Prophecy Trader",
          "profileImageUrl": "/images/..."
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    },
    "stats": {
      "totalNfts": 100,
      "claimedCount": 67,
      "unclaimedCount": 33
    },
    "filters": {
      "traits": [
        { "traitType": "Background", "values": ["Gold", "Blue", "Red"] }
      ]
    }
  }
}
```

### 5.2 GET /api/nft/[tokenId]

**Response**:
```json
{
  "success": true,
  "data": {
    "tokenId": 1,
    "name": "Babylon Guardian #1",
    "description": "A mystical guardian of the prediction markets...",
    "imageUrl": "https://ipfs.io/ipfs/Qm.../full.png",
    "thumbnailUrl": "https://ipfs.io/ipfs/Qm.../thumb.webp",
    "imageCid": "Qm...",
    "imageResolution": "4096x4096",
    "metadataUri": "ipfs://Qm.../1.json",
    "story": {
      "title": "The First Guardian",
      "content": "In the early days of Babylon, when the markets were young..."
    },
    "attributes": [
      { "trait_type": "Background", "value": "Celestial Gold" },
      { "trait_type": "Eyes", "value": "Oracle Vision" }
    ],
    "contractAddress": "0x...",
    "chainId": 1,
    "currentOwner": {
      "walletAddress": "0x...",
      "user": {
        "id": "user_123",
        "username": "prophecy_trader",
        "displayName": "Prophecy Trader",
        "profileImageUrl": "..."
      },
      "acquiredAt": "2025-01-15T00:00:00Z",
      "txHash": "0x..."
    },
    "originalClaim": {
      "claimedAt": "2025-01-15T00:00:00Z",
      "claimerAddress": "0x...",
      "claimerUserId": "user_123",
      "snapshotRank": 3,
      "snapshotPoints": 15000,
      "txHash": "0x..."
    }
  }
}
```

---

## 6. UI/UX Design Specifications

### 6.0 Navigation (NOT in Sidebar)

**Important**: The NFT Gallery is NOT added to the sidebar navigation. Instead:

1. **Mainpage Link**: Add a prominent link/banner on the landing page
   - e.g., "Explore Our NFT Collection →"
   - Positioned in hero section or featured area

2. **Leaderboard Page Link**: Add link on leaderboard page
   - e.g., "Top 100 players receive exclusive NFTs. View Collection →"
   - Positioned near the top of the leaderboard or as a banner

### 6.1 Gallery Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [Sidebar]  │                   Main Content                    │
│             ├───────────────────────────────────────────────────┤
│  Home       │  ┌─────────────────────────────────────────────┐  │
│  Markets    │  │  Babylon NFT Collection            [Filters] │  │
│  Leaderboard│  │  100 Unique NFTs • 67 Claimed               │  │
│  Chats      │  └─────────────────────────────────────────────┘  │
│  Agents     │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│  Rewards    │  │ #1  │ │ #2  │ │ #3  │ │ #4  │ │ #5  │        │
│  Profile    │  │     │ │     │ │     │ │     │ │     │        │
│             │  │ 👤  │ │ 👤  │ │     │ │ 👤  │ │     │        │
│  (NO NFT    │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘        │
│   LINK)     │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│             │  │ #6  │ │ #7  │ │ #8  │ │ #9  │ │ #10 │        │
│             │  │     │ │     │ │     │ │     │ │     │        │
│             │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘        │
│             │                                                   │
│             │              [Load More / Pagination]             │
└─────────────┴───────────────────────────────────────────────────┘
```

### 6.2 NFT Detail Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [Sidebar]  │                   Main Content                    │
│             ├───────────────────────────────────────────────────┤
│             │  ← Back to Collection                             │
│             │                                                   │
│             │  ┌───────────────────┐  ┌──────────────────────┐  │
│             │  │                   │  │  Babylon Guardian #1 │  │
│             │  │                   │  │  ━━━━━━━━━━━━━━━━━━━ │  │
│             │  │    [NFT Image]    │  │  Rank: #5 / 100      │  │
│             │  │                   │  │  Rarity: Legendary   │  │
│             │  │                   │  │                      │  │
│             │  │                   │  │  Owner: @prophecy    │  │
│             │  │                   │  │  Claimed: Jan 15     │  │
│             │  └───────────────────┘  └──────────────────────┘  │
│             │                                                   │
│             │  ┌────────────────────────────────────────────┐   │
│             │  │  The Story                                 │   │
│             │  │  ────────────────────────────────────────  │   │
│             │  │  In the early days of Babylon, when the    │   │
│             │  │  markets were young and predictions were   │   │
│             │  │  whispered rather than traded...           │   │
│             │  └────────────────────────────────────────────┘   │
│             │                                                   │
│             │  ┌────────────────────────────────────────────┐   │
│             │  │  Attributes                                │   │
│             │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│             │  │  │Background│ │  Eyes    │ │ Aura     │   │   │
│             │  │  │Celestial │ │ Oracle   │ │ Golden   │   │   │
│             │  │  │ Gold     │ │ Vision   │ │ Light    │   │   │
│             │  │  └──────────┘ └──────────┘ └──────────┘   │   │
│             │  └────────────────────────────────────────────┘   │
└─────────────┴───────────────────────────────────────────────────┘
```

### 6.3 Design Tokens

Use existing Babylon design system:
- **Background**: `bg-background`, `bg-card`, `bg-muted/30`
- **Borders**: `border-border`, `border-[#0066FF]/30`
- **Text**: `text-foreground`, `text-muted-foreground`
- **Accent**: `#0066FF` (Babylon blue), `#a855f7` (purple for special)
- **Typography**: System font stack (already configured)
- **Rarity Colors**:
  - Legendary: `#FFD700` (gold)
  - Epic: `#A855F7` (purple)
  - Rare: `#0066FF` (blue)
  - Common: `#6B7280` (gray)

---

## 7. Implementation Phases

### Phase 1: Foundation (2-3 days)

**Deliverables**:
- [ ] Database schema migration (`NftCollection`, `NftClaim` tables)
- [ ] Type definitions in `types/nft.ts`
- [ ] Basic API routes (skeleton)
- [ ] Gallery page route with loading state

**Blockers**: Need NFT artwork and metadata from BAB-66 team

### Phase 2: Core Gallery (3-4 days)

**Deliverables**:
- [ ] `NFTCard` component with image loading
- [ ] `NFTGrid` component with responsive layout
- [ ] `/api/nft/collection` endpoint with pagination
- [ ] Gallery page with grid rendering
- [ ] Basic skeleton loading states

**Requires**: Test data (can use placeholder images)

### Phase 3: Detail Page (2-3 days)

**Deliverables**:
- [ ] NFT detail page (`/nft/[tokenId]`)
- [ ] `NFTDetailView` component
- [ ] `NFTStorySection` component
- [ ] `NFTAttributeList` component
- [ ] `/api/nft/[tokenId]` endpoint
- [ ] Owner display integration

### Phase 4: Filtering & Polish (2 days)

**Deliverables**:
- [ ] `NFTFilters` component
- [ ] Sort functionality
- [ ] Search functionality
- [ ] Mobile responsiveness polish
- [ ] Loading/error states

### Phase 5: Integration (1-2 days)

**Deliverables**:
- [ ] Sidebar navigation link
- [ ] SEO metadata
- [ ] Analytics tracking
- [ ] Performance optimization (lazy loading, caching)
- [ ] Documentation

---

## 8. Unknowns & Risks

### 8.1 Open Questions - ✅ ALL RESOLVED

| Question | Resolution | Status |
|----------|------------|--------|
| What is the NFT artwork format/resolution? | **4096x4096** - requires thumbnail generation | ✅ Resolved |
| Who is writing the NFT stories? | **Puncar** will provide all stories and metadata | ✅ Resolved |
| IPFS gateway to use? | TBD - coordinate with BAB-66 team | ⏳ Pending BAB-66 |
| Real-time ownership updates needed? | **YES** - implement webhook/indexer approach | ✅ Resolved |
| Should gallery be public or auth-required? | **PUBLIC** - no authentication required | ✅ Resolved |
| Will there be rarity scores? | **NO** - no rarity scoring | ✅ Resolved |

### 8.2 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| IPFS gateway rate limiting | Medium | Image loading failures | Use multiple gateways, local caching |
| Large image sizes | Medium | Slow page load | Next.js Image optimization, thumbnails |
| Metadata schema changes | Low | API/type refactoring | Define schema early, validate inputs |
| Contract not deployed | Blocking | Can't show owners | Implement with mock data first |

### 8.3 Assumptions

1. NFT collection size is fixed at 100 NFTs
2. Metadata follows ERC721 metadata standard
3. Stories are provided as markdown or plain text
4. Images are hosted on IPFS (not centralized CDN)
5. Ownership can be determined from contract events

---

## 9. Testing Strategy

### 9.1 Unit Tests

- API route handlers (collection, detail)
- Data transformation utilities
- Filter/sort logic

### 9.2 Component Tests

- NFTCard rendering with various states
- NFTGrid responsive behavior
- NFTFilters interaction

### 9.3 Integration Tests

- Full gallery page load
- Navigation between gallery and detail
- Filter/sort affecting results

### 9.4 E2E Tests

- Load gallery → click NFT → view details → back to gallery
- Apply filters → verify results
- Mobile responsive behavior

---

## 10. Monitoring & Analytics

### 10.1 Key Metrics

- **Page Views**: `/nft` and `/nft/[tokenId]`
- **Engagement**: Click-through from gallery to detail
- **Performance**: LCP, FCP, CLS for gallery page
- **API Latency**: Collection and detail endpoints

### 10.2 PostHog Events

```typescript
// Gallery page view
posthog.capture('nft_gallery_viewed', { nft_count: 100 });

// NFT detail view
posthog.capture('nft_detail_viewed', { token_id: 1, rarity_rank: 5 });

// Filter applied
posthog.capture('nft_filter_applied', { filter_type: 'trait', value: 'Legendary' });
```

---

## 11. Future Enhancements (Out of Scope)

- NFT marketplace/trading functionality
- Leaderboard integration (show NFT next to owner on leaderboard)
- Profile page NFT showcase section
- External marketplace links (OpenSea, Blur)
- Social sharing with OG images
- 3D/animated NFT support
- Audio/video NFT support

---

## 12. Approval & Sign-off

| Role | Name | Status | Date |
|------|------|--------|------|
| Product Owner | Puncar | Pending | - |
| Technical Lead | TBD | Pending | - |
| Design | TBD | Pending | - |

---

## Appendix A: NFT Metadata Schema (Expected)

```json
{
  "name": "Babylon Guardian #1",
  "description": "A mystical guardian protecting the prediction markets of Babylon.",
  "image": "ipfs://Qm.../1.png",
  "external_url": "https://babylon.market/nft/1",
  "attributes": [
    { "trait_type": "Background", "value": "Celestial Gold" },
    { "trait_type": "Eyes", "value": "Oracle Vision" },
    { "trait_type": "Aura", "value": "Golden Light" },
    { "trait_type": "Rarity", "value": "Legendary" }
  ],
  "properties": {
    "story": {
      "title": "The First Guardian",
      "content": "In the early days of Babylon..."
    }
  }
}
```

---

## Appendix B: Related Code References

### Existing Patterns to Follow

- **Page Structure**: `apps/web/src/app/rewards/page.tsx` - Similar page layout with sidebar
- **Grid Layout**: `apps/web/src/components/admin/ContentModerationTab.tsx` - Media grid example
- **Image Loading**: `apps/web/src/components/landing/LandingPage.tsx` - Next.js Image usage
- **API Routes**: `apps/web/src/app/api/leaderboard/route.ts` - Pagination pattern
- **Card Components**: `apps/web/src/components/articles/ArticleCard.tsx` - Card with image
- **Dialog/Modal**: `apps/web/src/components/ui/dialog.tsx` - Detail modal option
- **Skeleton Loading**: `apps/web/src/components/shared/Skeleton.tsx` - Loading states

---

*Document Version: 1.0*  
*Last Updated: 2025-12-31*
