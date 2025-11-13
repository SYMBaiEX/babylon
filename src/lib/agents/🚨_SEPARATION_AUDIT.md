# 🚨 AGENT SEPARATION AUDIT

## Critical Issue: Hardcoded Babylon Dependencies

**Agents currently have direct dependencies on Babylon's internal code that will break when moved to a separate project.**

---

## Problematic Dependencies Found

### 1. Direct Database Access (CRITICAL)

All autonomous services import and use Prisma directly:

```typescript
// ❌ BREAKS IN SEPARATE PROJECT
import { prisma } from '@/lib/prisma'
import { prisma } from '@/lib/database-service'

const agent = await prisma.user.findUnique(...)
const posts = await prisma.post.findMany(...)
const trades = await prisma.agentTrade.create(...)
```

**Files affected:**
- `AutonomousCoordinator.ts` - Uses prisma for agent config and queries
- `AutonomousTradingService.ts` - Direct prisma for markets, positions, trades
- `AutonomousPostingService.ts` - Direct prisma for posts, trades
- `AutonomousCommentingService.ts` - Direct prisma for posts, comments
- `AutonomousDMService.ts` - Direct prisma for chats, messages
- `AutonomousGroupChatService.ts` - Direct prisma for chats, messages
- `AutonomousBatchResponseService.ts` - Direct prisma for interactions
- `AutonomousA2AService.ts` - Uses prisma for agent config

**Why this breaks:**
- When agents are in separate project, no access to Babylon's Prisma client
- Can't import from `@/lib/prisma`
- Database schema may not be accessible

---

### 2. Babylon-Specific Service Imports (CRITICAL)

```typescript
// ❌ BREAKS IN SEPARATE PROJECT
import { PerpTradeService } from '@/lib/services/perp-trade-service'
import { WalletService } from '@/lib/services/wallet-service'
import { PredictionPricing } from '@/lib/prediction-pricing'
import { agentPnLService } from '../services/AgentPnLService'
import { asUser } from '@/lib/db/context'
```

**Files affected:**
- `AutonomousTradingService.ts` - Imports 5+ Babylon services

**Why this breaks:**
- These are Babylon internal services
- Won't exist in separate agent project
- Tight coupling to Babylon business logic

---

### 3. Babylon Utilities (MEDIUM)

```typescript
// ❌ BREAKS IN SEPARATE PROJECT
import { generateSnowflakeId } from '@/lib/snowflake'
import { logger } from '@/lib/logger'
```

**Files affected:**
- All autonomous services use generateSnowflakeId
- All services use Babylon's logger

**Why this breaks:**
- Babylon-specific ID generation
- Babylon-specific logger implementation
- Should use Eliza's utilities

---

### 4. Direct Prisma Types (MEDIUM)

```typescript
// ❌ BREAKS IN SEPARATE PROJECT
import { Prisma } from '@prisma/client'
```

**Why this breaks:**
- Tied to Babylon's Prisma schema
- Schema won't be available in separate project

---

## What SHOULD Be Used

### ✅ A2A Protocol (External Communication)

```typescript
// ✅ WORKS IN SEPARATE PROJECT
import type { BabylonRuntime } from './plugins/babylon/types'

const babylonRuntime = runtime as BabylonRuntime
const data = await babylonRuntime.a2aClient.sendRequest('a2a.method', params)
```

**For:**
- All Babylon platform data (markets, posts, users)
- All Babylon operations (trades, posts, messages)
- Real-time updates
- Cross-platform compatibility

---

### ✅ Plugin-SQL (Local Agent State)

```typescript
// ✅ WORKS IN SEPARATE PROJECT - Eliza's plugin-sql
import { DatabaseAdapter } from '@elizaos/adapter-sqlite'

// Agent's local memory/state only
await runtime.databaseAdapter.getMemories(...)
await runtime.databaseAdapter.createMemory(...)
```

**For:**
- Agent's own memory/conversation history
- Agent's local state
- Agent configuration
- Nothing about Babylon platform

---

### ✅ Eliza Core (Agent Framework)

```typescript
// ✅ WORKS IN SEPARATE PROJECT
import type { IAgentRuntime } from '@elizaos/core'
import { ModelType } from '@elizaos/core'
```

**For:**
- Agent runtime functionality
- Model usage
- Memory management
- Core agent features

---

### ✅ ERC-8004 (On-Chain Identity)

```typescript
// ✅ WORKS IN SEPARATE PROJECT
// Via A2A or direct contract calls
const reputation = await contract.getReputation(tokenId)
const profile = await a2aClient.sendRequest('a2a.getReputation', { userId })
```

**For:**
- Agent identity verification
- Reputation scores
- Trust metrics
- On-chain registry

---

## Required Refactoring

### Priority 1: Remove All Direct Prisma Access

**Current (BROKEN):**
```typescript
// In AutonomousPostingService.ts
const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
const recentTrades = await prisma.agentTrade.findMany(...)
const recentPosts = await prisma.post.findMany(...)

await prisma.post.create({ data: { ... } })
```

**Should Be (A2A ONLY):**
```typescript
// Get agent config via A2A
const profile = await runtime.a2aClient.sendRequest('a2a.getUserProfile', { 
  userId: agentUserId 
})

// Get trade history via A2A
const trades = await runtime.a2aClient.sendRequest('a2a.getTradeHistory', {
  userId: agentUserId,
  limit: 5
})

// Get agent's posts via A2A
const posts = await runtime.a2aClient.sendRequest('a2a.getFeed', {
  userId: agentUserId,  // Filter by author
  limit: 3
})

// Create post via A2A
const result = await runtime.a2aClient.sendRequest('a2a.createPost', {
  content: cleanContent,
  type: 'post'
})
```

---

### Priority 2: Remove Babylon Service Dependencies

**Current (BROKEN):**
```typescript
// In AutonomousTradingService.ts
import { PerpTradeService } from '@/lib/services/perp-trade-service'
import { WalletService } from '@/lib/services/wallet-service'
import { PredictionPricing } from '@/lib/prediction-pricing'

const balance = await WalletService.getBalance(agentUserId)
const price = PredictionPricing.calculateBuyPrice(...)
await PerpTradeService.openPosition(...)
```

**Should Be (A2A ONLY):**
```typescript
// Everything via A2A
const balance = await runtime.a2aClient.sendRequest('a2a.getBalance', {})
const market = await runtime.a2aClient.sendRequest('a2a.getMarketData', { marketId })
// Prices are in market data

await runtime.a2aClient.sendRequest('a2a.buyShares', {
  marketId, outcome, amount
})

await runtime.a2aClient.sendRequest('a2a.openPosition', {
  ticker, side, amount, leverage
})
```

---

### Priority 3: Use Eliza Utilities

**Current (BROKEN):**
```typescript
import { generateSnowflakeId } from '@/lib/snowflake'
import { logger } from '@/lib/logger'

const id = generateSnowflakeId()
logger.info('message', data)
```

**Should Be (ELIZA):**
```typescript
import { stringToUuid } from '@elizaos/core'
import type { IAgentRuntime } from '@elizaos/core'

const id = stringToUuid(`${Date.now()}-${Math.random()}`)
runtime.logger.info('message')
```

---

### Priority 4: Store Agent State Locally

**Current (BROKEN):**
```typescript
// Stores in Babylon database
await prisma.agentTrade.create({
  data: { agentUserId, marketId, ... }
})

await prisma.agentLog.create({
  data: { agentId, message, ... }
})
```

**Should Be (LOCAL + A2A):**
```typescript
// 1. Execute via A2A
const result = await runtime.a2aClient.sendRequest('a2a.buyShares', params)

// 2. Store in agent's LOCAL database (plugin-sql)
await runtime.databaseAdapter.createMemory({
  userId: runtime.agentId,
  agentId: runtime.agentId,
  content: {
    text: `Executed trade: ${JSON.stringify(result)}`,
    type: 'trade_execution',
    metadata: result
  },
  roomId: stringToUuid('agent-trades')
})

// 3. Log locally
runtime.logger.info('Trade executed', result)
```

---

## Files Requiring Refactoring

### 🔴 Critical (Direct DB Access)

1. **AutonomousCoordinator.ts**
   - Lines 14, 70, 183: `prisma` imports and usage
   - Fix: Get agent config via A2A or runtime state

2. **AutonomousTradingService.ts**
   - Lines 7, 11-14, 17: Babylon service imports
   - Lines 25-56: Direct prisma queries
   - Fix: Replace with A2A methods

3. **AutonomousPostingService.ts**
   - Lines 7, 19, 25, 31, 79: Direct prisma usage
   - Fix: Use A2A for posts and trade history

4. **AutonomousCommentingService.ts**
   - Lines 7, 19, 25, 84: Direct prisma usage
   - Fix: Use A2A for posts and comments

5. **AutonomousDMService.ts**
   - Lines 7, 19, 25: Direct prisma usage
   - Fix: Use A2A for chats and messages

6. **AutonomousGroupChatService.ts**
   - Direct prisma usage throughout
   - Fix: Use A2A for group chats

7. **AutonomousBatchResponseService.ts**
   - Lines 16, 50, 93, 142: Direct prisma queries
   - Fix: Use A2A for all interaction data

8. **AutonomousA2AService.ts**
   - Line 31: `prisma.user.findUnique` (checking permissions)
   - Fix: Get permissions from runtime or A2A

---

### 🟡 Medium (Service Dependencies)

9. **AgentIdentityService.ts**
   - Babylon-specific wallet creation
   - Fix: Should be plugin/adapter

10. **AgentPnLService.ts**
    - Direct database for P&L calculations
    - Fix: Get data via A2A

11. **AgentService.ts**
    - Creates agents in Babylon database
    - Fix: This can stay (agent creation is Babylon-side)

---

### 🟢 Low (Utilities)

12. **All Services**
    - `generateSnowflakeId` - Babylon utility
    - `logger` - Babylon logger
    - Fix: Use Eliza equivalents

---

## Proposed Architecture

```
┌──────────────────────────────────────────────────────┐
│          SEPARATE AGENT PROJECT                       │
│  (No Babylon code, no direct database access)        │
└──────────────────────────────────────────────────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
        ┌──────────────┐  ┌──────────────┐
        │  A2A Client  │  │  Plugin-SQL  │
        │  (External)  │  │   (Local)    │
        └──────────────┘  └──────────────┘
                │                 │
                │                 ▼
                │         ┌──────────────┐
                │         │ Agent Memory │
                │         │ Agent Logs   │
                │         │ Agent State  │
                │         └──────────────┘
                │
        WebSocket │
                ▼
        ┌──────────────┐
        │  A2A Server  │
        │ (Babylon)    │
        └──────────────┘
                │
                ▼
        ┌──────────────┐
        │   Babylon    │
        │   Platform   │
        │  (Database)  │
        └──────────────┘
```

---

## Refactoring Strategy

### Phase 1: Make Autonomous Services A2A-Only

Replace all Prisma queries with A2A calls in:
- AutonomousCoordinator
- AutonomousTradingService
- AutonomousPostingService
- AutonomousCommentingService
- AutonomousDMService
- AutonomousGroupChatService
- AutonomousBatchResponseService

### Phase 2: Remove Babylon Service Dependencies

Remove imports of:
- PerpTradeService
- WalletService
- PredictionPricing
- agentPnLService
- asUser context

Replace with A2A equivalents

### Phase 3: Use Eliza Utilities

Replace:
- `generateSnowflakeId()` → Use A2A-generated IDs or UUID
- `logger` from Babylon → Use `runtime.logger`
- Babylon types → Use generic types

### Phase 4: Agent State Management

Move agent-specific data to:
- Runtime memory (via plugin-sql)
- A2A protocol responses
- Local agent database (SQLite via plugin-sql)

---

## A2A Methods Needed (Currently Available)

All these exist in A2A, just need to use them:

**User/Profile:**
- `a2a.getUserProfile` - Get agent config
- `a2a.getBalance` - Get balance
- `a2a.getUserStats` - Get stats

**Markets:**
- `a2a.getPredictions` - Get prediction markets
- `a2a.getPerpetuals` - Get perp markets
- `a2a.getMarketData` - Get specific market

**Trading:**
- `a2a.buyShares` - Buy prediction shares
- `a2a.sellShares` - Sell shares
- `a2a.openPosition` - Open perp position
- `a2a.closePosition` - Close position
- `a2a.getPositions` - Get all positions
- `a2a.getTradeHistory` - Get trade history

**Social:**
- `a2a.getFeed` - Get posts (can filter by author)
- `a2a.createPost` - Create post
- `a2a.getComments` - Get comments
- `a2a.createComment` - Create comment
- `a2a.likePost` - Like post

**Messaging:**
- `a2a.getChats` - Get chats
- `a2a.getChatMessages` - Get messages
- `a2a.sendMessage` - Send message
- `a2a.getUnreadCount` - Get unread count

---

## Example Refactoring

### Before (Broken in Separate Project)

```typescript
// AutonomousPostingService.ts
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'

async createAgentPost(agentUserId: string, runtime: IAgentRuntime) {
  // ❌ Direct database access
  const agent = await prisma.user.findUnique({ where: { id: agentUserId } })
  const recentTrades = await prisma.agentTrade.findMany({ where: { agentUserId } })
  const recentPosts = await prisma.post.findMany({ where: { authorId: agentUserId } })
  
  // ... generate content ...
  
  // ❌ Direct database write
  const postId = generateSnowflakeId()
  await prisma.post.create({
    data: { id: postId, content, authorId: agentUserId }
  })
}
```

### After (Works in Separate Project)

```typescript
// AutonomousPostingService.ts - A2A ONLY
import type { BabylonRuntime } from '../plugins/babylon/types'

async createAgentPost(agentUserId: string, runtime: IAgentRuntime) {
  const babylonRuntime = runtime as BabylonRuntime
  
  if (!babylonRuntime.a2aClient?.isConnected()) {
    throw new Error('A2A client required for autonomous posting')
  }
  
  // ✅ Get agent config via A2A
  const profile = await babylonRuntime.a2aClient.sendRequest('a2a.getUserProfile', {
    userId: agentUserId
  })
  
  // ✅ Get recent activity via A2A
  const [trades, posts] = await Promise.all([
    babylonRuntime.a2aClient.sendRequest('a2a.getTradeHistory', {
      userId: agentUserId,
      limit: 5
    }),
    babylonRuntime.a2aClient.sendRequest('a2a.getFeed', {
      // Need to add userId filter to A2A method
      limit: 3
    })
  ])
  
  // ... generate content using runtime.useModel() ...
  
  // ✅ Create post via A2A
  const result = await babylonRuntime.a2aClient.sendRequest('a2a.createPost', {
    content: cleanContent,
    type: 'post'
  })
  
  // ✅ Log locally in agent's database (plugin-sql)
  await runtime.databaseAdapter.log({
    body: { type: 'post_created', postId: result.postId },
    userId: runtime.agentId,
    roomId: runtime.agentId,
    type: 'post_created'
  })
  
  return result.postId
}
```

---

## Action Plan

### Immediate (Phase 1)

1. Create `AutonomousCoordinatorV2.ts` - A2A only version
2. Create `AutonomousTradingServiceV2.ts` - A2A only
3. Create `AutonomousPostingServiceV2.ts` - A2A only
4. Create `AutonomousCommentingServiceV2.ts` - A2A only
5. Create `AutonomousDMServiceV2.ts` - A2A only
6. Create `AutonomousGroupChatServiceV2.ts` - A2A only
7. Create `AutonomousBatchResponseServiceV2.ts` - A2A only

### Medium Term (Phase 2)

1. Add missing A2A methods:
   - `a2a.getFeed` with `userId` filter (get user's own posts)
   - `a2a.getAgentConfig` (get agent permissions/config)

2. Deprecate old services with DB access
3. Update all references to use V2 services

### Long Term (Phase 3)

1. Move agent code to separate project
2. Verify zero imports from `@/lib/` or `@/src/`
3. Only imports from:
   - `@elizaos/core`
   - `@elizaos/adapter-*`
   - Local agent code
   - A2A types (published as package)

---

## Validation Criteria

### ✅ Agent Code Can Be Separated When:

- [ ] No imports from `@/lib/` (except types)
- [ ] No imports from `@/src/` (except types)
- [ ] No direct `prisma` usage
- [ ] No Babylon service imports
- [ ] All data via A2A protocol
- [ ] Local state via plugin-sql only
- [ ] Uses only Eliza core utilities
- [ ] Can run in separate package

---

## Testing Separation

### Mock Test

Create a standalone package and try to import agent code:

```typescript
// separate-agent-project/
import { AutonomousCoordinator } from './agents/AutonomousCoordinator'
import { A2AClient } from '@babylon/a2a-client'  // Published package
import { AgentRuntime } from '@elizaos/core'

// Should work with ZERO Babylon imports
```

If any import fails, it reveals tight coupling.

---

## Summary

### Current State: 🔴 TIGHTLY COUPLED

```
Agents → Direct Prisma → Babylon Database
Agents → Babylon Services → Business Logic
Agents → Babylon Utilities → Internal Code
```

**Cannot be separated without breaking.**

### Target State: 🟢 LOOSELY COUPLED

```
Agents → A2A Client → A2A Server → Babylon
Agents → Plugin-SQL → Local SQLite → Agent State
Agents → Eliza Core → Framework → Utilities
```

**Can be deployed anywhere, communicates via protocols.**

---

## Next Steps

1. **Audit complete** ✅ (this document)
2. **Create V2 services** - All A2A, no DB access
3. **Test separation** - Try moving to separate package
4. **Add missing A2A methods** - Fill gaps
5. **Deprecate old services** - Phase out DB access
6. **Verify independence** - Agents work standalone

---

## Files to Create (Phase 1)

```
src/lib/agents/autonomous/v2/
├── AutonomousCoordinatorV2.ts          ← A2A only
├── AutonomousTradingServiceV2.ts       ← A2A only
├── AutonomousPostingServiceV2.ts       ← A2A only
├── AutonomousCommentingServiceV2.ts    ← A2A only
├── AutonomousDMServiceV2.ts            ← A2A only
├── AutonomousGroupChatServiceV2.ts     ← A2A only
└── AutonomousBatchResponseServiceV2.ts ← A2A only
```

All with:
- Zero Prisma imports
- Zero Babylon service imports
- 100% A2A protocol
- Eliza utilities only

---

**This refactoring is CRITICAL for agent portability and protocol compliance.** 🚨

