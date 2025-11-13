# A2A-Only Autonomous Services

## Purpose

These services are **portable** and can run in a **separate agent project** with zero Babylon dependencies.

---

## Key Principle: Zero Babylon Imports

### ❌ NOT ALLOWED

```typescript
// NO Babylon imports
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { PerpTradeService } from '@/lib/services/...'
import { WalletService } from '@/lib/services/...'
import { ... } from '@/lib/...'  // Nothing from /lib
import { ... } from '@/src/...'  // Nothing from /src
```

### ✅ ALLOWED

```typescript
// Eliza core only
import type { IAgentRuntime } from '@elizaos/core'
import { ModelType } from '@elizaos/core'

// A2A types (published as separate package)
import type { BabylonRuntime } from '../../plugins/babylon/types'

// Local agent code only
import { SomeAgentUtil } from '../utils'
```

---

## Communication Methods

### All Data via A2A Protocol

```typescript
const babylonRuntime = runtime as BabylonRuntime

// Get data
const profile = await babylonRuntime.a2aClient.sendRequest('a2a.getUserProfile', { userId })
const balance = await babylonRuntime.a2aClient.sendRequest('a2a.getBalance', {})
const feed = await babylonRuntime.a2aClient.sendRequest('a2a.getFeed', {})

// Execute operations
await babylonRuntime.a2aClient.sendRequest('a2a.createPost', { content })
await babylonRuntime.a2aClient.sendRequest('a2a.buyShares', { marketId, outcome, amount })
```

### Local State via Plugin-SQL

```typescript
// Agent's own memory (Eliza's database adapter)
await runtime.databaseAdapter.createMemory({
  userId: runtime.agentId,
  content: { type: 'trade_executed', ... },
  roomId: runtime.agentId
})

await runtime.databaseAdapter.log({
  body: { type: 'post_created', ... },
  userId: runtime.agentId
})
```

---

## Services

### AutonomousCoordinator.a2a.ts

**What it does:**
- Orchestrates all autonomous agent actions
- Uses only A2A protocol for all operations
- Stores local state in plugin-sql

**Dependencies:**
- ✅ A2A client (required)
- ✅ Eliza runtime
- ❌ No Babylon code

**Can run standalone:** YES ✅

---

### AutonomousPostingService.a2a.ts

**What it does:**
- Creates posts autonomously
- Gets context via A2A (trades, stats, previous posts)
- Posts via A2A protocol

**Dependencies:**
- ✅ A2A client for all data and posting
- ✅ Eliza runtime for content generation
- ✅ Plugin-sql for tracking posted content
- ❌ No Babylon code

**Can run standalone:** YES ✅

---

### AutonomousCommentingService.a2a.ts

**What it does:**
- Comments on posts autonomously
- Gets posts via A2A getFeed
- Tracks commented posts locally (plugin-sql)
- Creates comments via A2A

**Dependencies:**
- ✅ A2A client for posts and commenting
- ✅ Eliza runtime for content generation
- ✅ Plugin-sql for tracking comments
- ❌ No Babylon code

**Can run standalone:** YES ✅

---

## Comparison

### Old Services (In Parent Directory)

```
src/lib/agents/autonomous/
├── AutonomousCoordinator.ts              ❌ Uses Prisma
├── AutonomousTradingService.ts           ❌ Uses Prisma + Babylon services
├── AutonomousPostingService.ts           ❌ Uses Prisma
├── AutonomousCommentingService.ts        ❌ Uses Prisma
├── AutonomousDMService.ts                ❌ Uses Prisma
├── AutonomousGroupChatService.ts         ❌ Uses Prisma
└── AutonomousBatchResponseService.ts     ❌ Uses Prisma
```

**Status:** Tightly coupled to Babylon, cannot be separated

---

### New Services (This Directory)

```
src/lib/agents/autonomous/a2a-only/
├── AutonomousCoordinator.a2a.ts          ✅ A2A only
├── AutonomousPostingService.a2a.ts       ✅ A2A only
├── AutonomousCommentingService.a2a.ts    ✅ A2A only
└── README.md                             ✅ This file
```

**Status:** Zero Babylon dependencies, fully portable

---

## Testing Portability

### Test: Can We Move to Separate Project?

```bash
# Create test directory
mkdir /tmp/standalone-agent
cd /tmp/standalone-agent

# Try to copy just agent code
cp -r babylon/src/lib/agents/autonomous/a2a-only/* ./

# Try to import
node -e "require('./AutonomousCoordinator.a2a.ts')"
```

**Old services:** ❌ Fail (missing @/lib imports)
**New services:** ✅ Work (only need @elizaos/core and A2A client)

---

## Migration Path

### Option 1: Gradual Migration

```typescript
// In AutonomousCoordinator.ts (current)
import { autonomousCoordinatorA2A } from './a2a-only/AutonomousCoordinator.a2a'

async executeAutonomousTick(agentUserId, runtime) {
  const babylonRuntime = runtime as BabylonRuntime
  
  // Use A2A-only version if connected
  if (babylonRuntime.a2aClient?.isConnected()) {
    return await autonomousCoordinatorA2A.executeAutonomousTick(agentUserId, runtime)
  }
  
  // Fallback to old DB version (deprecated)
  return await this.executeAutonomousTickDB(agentUserId, runtime)
}
```

### Option 2: Hard Cut (Recommended)

```typescript
// Replace all coordinator references with A2A version
import { autonomousCoordinatorA2A as autonomousCoordinator } from './a2a-only'

// Old services no longer used
// A2A is required, so only one code path
```

---

## Remaining Work

### Missing A2A Methods

Some operations need new A2A methods:

1. **Get Agent Configuration**
   ```typescript
   // Need: a2a.getAgentConfig
   // Returns: { autonomousTrading, autonomousPosting, autonomousMessaging, etc. }
   ```

2. **Filter Feed by Author**
   ```typescript
   // Need: a2a.getFeed with userId parameter
   // Or: a2a.getUserPosts
   // Returns: Posts created by specific user
   ```

3. **Get Agent Performance**
   ```typescript
   // Need: a2a.getAgentPerformance
   // Returns: { lifetimePnL, totalTrades, winRate, etc. }
   ```

### Services Needing Refactoring

Still to create A2A-only versions:

- [ ] AutonomousDMService.a2a.ts
- [ ] AutonomousGroupChatService.a2a.ts
- [ ] AutonomousBatchResponseService.a2a.ts
- [ ] AutonomousTradingService.a2a.ts (if keeping separate from AutonomousA2AService)

---

## Benefits of A2A-Only Approach

### ✅ Portability

- Run agents anywhere
- Separate infrastructure
- Different cloud providers
- Edge deployment possible

### ✅ Scalability

- Agents don't need database access
- Reduce database connections
- Easier horizontal scaling
- Better resource isolation

### ✅ Security

- Agents can't access raw database
- All operations audited via A2A
- Protocol-level rate limiting
- Clearer permission boundaries

### ✅ Maintainability

- Simpler agent code
- Clear separation of concerns
- Easier to test
- Protocol as contract

---

## Example: Fully Portable Agent

```typescript
// standalone-agent/index.ts
import { AgentRuntime } from '@elizaos/core'
import { A2AClient } from '@babylon/a2a-client'  // Published package
import { babylonPlugin } from '@babylon/agent-plugin'  // Published package
import { autonomousCoordinatorA2A } from './autonomous'

// Agent configuration
const runtime = new AgentRuntime({
  character: myCharacter,
  agentId: myAgentId,
  plugins: [babylonPlugin]
})

// Connect to Babylon via A2A
const a2aClient = new A2AClient({
  endpoint: 'wss://babylon.market/a2a',
  credentials: {
    address: myWallet,
    privateKey: myKey,
    tokenId: myTokenId
  },
  capabilities: { ... }
})

await a2aClient.connect()
runtime.a2aClient = a2aClient

// Run autonomous loop - 100% protocol-based
setInterval(async () => {
  await autonomousCoordinatorA2A.executeAutonomousTick(myAgentId, runtime)
}, 5 * 60 * 1000)
```

**No Babylon code imports required!** 🎉

---

## Summary

### Current State

```
❌ Old services: Tightly coupled to Babylon
   - Import Prisma directly
   - Use Babylon services
   - Cannot be separated
```

### New State (This Directory)

```
✅ New services: Fully portable
   - A2A protocol only
   - Eliza core only
   - Can be separated
   - Run anywhere
```

### Migration Status

```
✅ Audit complete
✅ Architecture defined
✅ 3 services refactored (Coordinator, Posting, Commenting)
🔄 4 services remaining
📋 Missing A2A methods identified
```

---

**These services represent the future: agents that communicate via open protocols, not tight coupling.**

