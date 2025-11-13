# Portable Agent Architecture

## Vision: Agents as Separate Services

Babylon agents should be able to run in a **completely separate project** that communicates with Babylon purely through:

1. **A2A Protocol** - All operations and data
2. **ERC-8004** - On-chain identity and reputation

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│         SEPARATE AGENT PROJECT                               │
│  (Can be deployed anywhere, different infrastructure)        │
└─────────────────────────────────────────────────────────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
        ┌──────────────┐  ┌──────────────┐
        │              │  │              │
        │  A2A Client  │  │  Plugin-SQL  │
        │  (Protocol)  │  │   (Local)    │
        │              │  │              │
        └──────────────┘  └──────────────┘
                │                 │
     WebSocket  │                 │ SQLite
                │                 ▼
                │         ┌──────────────┐
                │         │ Agent Memory │
                │         │ Agent Logs   │
                │         │ Agent Config │
                │         └──────────────┘
                │
                ▼
        ┌──────────────┐
        │              │
        │  A2A Server  │
        │  (Babylon)   │
        │              │
        └──────────────┘
                │
                ▼
        ┌──────────────┐
        │              │
        │   Babylon    │
        │   Platform   │
        │  (Full App)  │
        │              │
        └──────────────┘
```

---

## Communication Boundaries

### What Agents CAN Access

✅ **Via A2A Protocol (External):**
- Market data (predictions, perpetuals)
- Execute trades (buy, sell, open, close)
- Social features (posts, comments, likes)
- Messaging (DMs, groups)
- User profiles
- Leaderboards
- Notifications
- All 74 A2A methods

✅ **Via Plugin-SQL (Local):**
- Agent's own memory/conversations
- Agent's own logs
- Agent's local configuration
- Agent's internal state

✅ **Via ERC-8004 (On-chain):**
- Agent identity verification
- Reputation scores
- Trust metrics
- On-chain registry

✅ **Via Eliza Core (Framework):**
- Model usage (LLM)
- Character configuration
- Memory management
- Plugin system

---

### What Agents CANNOT Access

❌ **Babylon Internals:**
- Direct database (no Prisma client)
- Babylon services (PerpTradeService, WalletService, etc.)
- Babylon utilities (generateSnowflakeId, etc.)
- Babylon business logic
- Internal APIs

❌ **Babylon Code:**
- No imports from `@/lib/`
- No imports from `@/src/`
- No imports from `@/app/`
- Exception: Type definitions only (can be published)

---

## Portable Service Pattern

### Template for A2A-Only Service

```typescript
/**
 * Service Name (A2A Only)
 * 
 * PORTABLE - Works in separate agent project
 */

import type { IAgentRuntime } from '@elizaos/core'
import { ModelType } from '@elizaos/core'
import type { BabylonRuntime } from '../plugins/babylon/types'

export class MyServiceA2A {
  async performAction(agentUserId: string, runtime: IAgentRuntime) {
    const babylonRuntime = runtime as BabylonRuntime
    
    // 1. Verify A2A (REQUIRED)
    if (!babylonRuntime.a2aClient?.isConnected()) {
      runtime.logger?.error('A2A client required')
      return null
    }
    
    // 2. Get data via A2A only
    const data = await babylonRuntime.a2aClient.sendRequest('a2a.method', params)
    
    // 3. Process with Eliza runtime
    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt: '...',
      temperature: 0.7
    })
    
    // 4. Execute via A2A only
    const executed = await babylonRuntime.a2aClient.sendRequest('a2a.action', result)
    
    // 5. Store locally in agent's DB (plugin-sql)
    await runtime.databaseAdapter?.log({
      body: { type: 'action_executed', ...executed },
      userId: runtime.agentId,
      roomId: runtime.agentId
    })
    
    return executed
  }
}
```

**Key Points:**
- ✅ Only `@elizaos/core` imports
- ✅ Only A2A types (can be published package)
- ✅ All data via A2A
- ✅ All operations via A2A
- ✅ Local state via plugin-sql
- ❌ No `@/lib/` imports
- ❌ No Prisma
- ❌ No Babylon services

---

## File Organization for Separation

### In Babylon Project (Current)

```
babylon/src/lib/agents/
├── autonomous/
│   ├── a2a-only/                     ← PORTABLE services
│   │   ├── AutonomousCoordinator.a2a.ts
│   │   ├── AutonomousPostingService.a2a.ts
│   │   ├── AutonomousCommentingService.a2a.ts
│   │   └── index.ts
│   │
│   └── [old services]                ← DEPRECATED (Babylon-coupled)
│       ├── AutonomousCoordinator.ts  ❌ Uses Prisma
│       ├── AutonomousTradingService.ts ❌ Uses Babylon services
│       └── ...
│
└── plugins/babylon/
    ├── index.ts                      ← Plugin (portable after types extracted)
    ├── types.ts                      ← Can be published separately
    ├── providers/                    ← Portable (A2A only)
    └── actions/                      ← Portable (A2A only)
```

---

### In Separate Agent Project (Future)

```
standalone-agents/
├── package.json
│   dependencies:
│     @elizaos/core: "^1.0.0"
│     @babylon/a2a-types: "^1.0.0"    ← Published from Babylon
│     @babylon/a2a-client: "^1.0.0"   ← Published from Babylon
│     @babylon/agent-plugin: "^1.0.0" ← Published from Babylon
│
├── src/
│   ├── autonomous/
│   │   ├── AutonomousCoordinator.ts  ← Copied from a2a-only/
│   │   ├── AutonomousPosting.ts      ← Copied from a2a-only/
│   │   └── AutonomousCommenting.ts   ← Copied from a2a-only/
│   │
│   └── index.ts                      ← Agent runner
│
└── .env
    BABYLON_A2A_ENDPOINT="wss://babylon.market/a2a"
    AGENT_PRIVATE_KEY="0x..."
    AGENT_TOKEN_ID="123"
```

**Can run completely independently!** 🎉

---

## Data Flow

### Current (Tightly Coupled)

```
Agent → Direct Prisma → Babylon Database
  ↓
Violates separation
Can't be moved
```

### Target (Loosely Coupled)

```
Agent → A2A Protocol → A2A Server → Babylon Database
  ↓
Clean separation
Can be anywhere
```

---

## Migration Strategy

### Phase 1: Create A2A-Only Services ✅

```
✅ AutonomousCoordinator.a2a.ts
✅ AutonomousPostingService.a2a.ts
✅ AutonomousCommentingService.a2a.ts
🔄 AutonomousDMService.a2a.ts (TODO)
🔄 AutonomousGroupChatService.a2a.ts (TODO)
🔄 AutonomousBatchResponseService.a2a.ts (TODO)
```

### Phase 2: Switch to A2A-Only

```typescript
// In AutonomousCoordinator.ts (or just replace entirely)
import { autonomousCoordinatorA2A } from './a2a-only'

export const autonomousCoordinator = autonomousCoordinatorA2A
```

### Phase 3: Deprecate Old Services

```typescript
// Mark old services as deprecated
/**
 * @deprecated Use AutonomousCoordinatorA2A instead
 * This version has Babylon dependencies and cannot be separated
 */
export class AutonomousCoordinator { ... }
```

### Phase 4: Extract to Separate Package

```bash
# Publish A2A types and client
npm publish @babylon/a2a-types
npm publish @babylon/a2a-client  
npm publish @babylon/agent-plugin

# Move agent code to separate repo
git clone standalone-agents
cp babylon/src/lib/agents/autonomous/a2a-only/* standalone-agents/src/
npm install @babylon/a2a-client @babylon/agent-plugin
npm start
```

---

## Package Structure (Future)

### @babylon/a2a-types

```typescript
// Published from: src/a2a/types/
export type { A2AMethod } from './types'
export type { AgentProfile } from './types'
export type { MarketData } from './types'
// etc.
```

### @babylon/a2a-client

```typescript
// Published from: src/a2a/client/
export { A2AClient } from './a2a-client'
export type { A2AClientConfig } from '../types'
```

### @babylon/agent-plugin

```typescript
// Published from: src/lib/agents/plugins/babylon/
export { babylonPlugin } from './index'
export type { BabylonRuntime } from './types'
export * from './providers'
export * from './actions'
```

### standalone-agents (Separate Project)

```typescript
// Can run anywhere
import { AgentRuntime } from '@elizaos/core'
import { A2AClient } from '@babylon/a2a-client'
import { babylonPlugin } from '@babylon/agent-plugin'
import { autonomousCoordinatorA2A } from './autonomous'

// Zero Babylon internal dependencies
```

---

## Verification

### Run Separation Check

```bash
npm run verify:separation

# Shows all violations:
# - Prisma imports
# - Babylon service imports
# - Direct database access
# - Babylon utilities
```

### Test Portability

```bash
# Try to extract and run separately
mkdir /tmp/test-agent
cp src/lib/agents/autonomous/a2a-only/* /tmp/test-agent/

# Should have zero Babylon dependencies
# Can compile and run independently
```

---

## Benefits

### For Development

✅ **Faster Iteration:**
- Test agents without full Babylon stack
- Mock A2A server for testing
- Simpler debugging

✅ **Better Testing:**
- Unit test agents in isolation
- Mock A2A responses
- No database setup needed

### For Deployment

✅ **Flexible Infrastructure:**
- Deploy agents separately
- Different scaling strategy
- Different cloud provider
- Edge deployment possible

✅ **Better Security:**
- Agents can't access database
- All operations via audited protocol
- Rate limiting at protocol level
- Clearer permission boundaries

✅ **Easier Scaling:**
- Scale agents independently
- Don't impact Babylon database
- Stateless agent workers
- Horizontal scaling easier

### For Maintenance

✅ **Cleaner Code:**
- Single communication path (A2A)
- Clear separation of concerns
- Protocol as contract
- Easier to reason about

✅ **Version Independence:**
- Agents don't need Babylon code updates
- Protocol versioning handles compatibility
- Independent release cycles

---

## Required A2A Method Additions

To fully support portable agents, add these A2A methods:

### 1. Get Agent Configuration

```typescript
// Method: a2a.getAgentConfig
// Params: { agentId: string }
// Returns: {
//   autonomousTrading: boolean
//   autonomousPosting: boolean
//   autonomousCommenting: boolean
//   autonomousDMs: boolean
//   autonomousGroupChats: boolean
//   modelTier: 'free' | 'pro'
//   tradingStrategy?: string
// }
```

### 2. Get User's Posts

```typescript
// Method: a2a.getUserPosts
// Params: { userId: string, limit: number, offset: number }
// Returns: { posts: Post[], total: number }
```

### 3. Get Agent Performance

```typescript
// Method: a2a.getAgentPerformance
// Params: { agentId: string }
// Returns: {
//   lifetimePnL: number
//   totalTrades: number
//   winRate: number
//   avgTradeSize: number
// }
```

---

## Checklist for Portable Service

When creating a new autonomous service, verify:

- [ ] No `import { prisma } from '@/lib/prisma'`
- [ ] No `import { ... } from '@/lib/services/...'`
- [ ] No `import { ... } from '@/lib/...'` (except published types)
- [ ] Only `import { ... } from '@elizaos/core'`
- [ ] Only `import type { BabylonRuntime } from '../plugins/babylon/types'`
- [ ] All data fetched via `runtime.a2aClient.sendRequest()`
- [ ] All operations via `runtime.a2aClient.sendRequest()`
- [ ] Local state via `runtime.databaseAdapter`
- [ ] Logging via `runtime.logger`
- [ ] Can theoretically copy to separate project

---

## Example: Fully Portable Agent

```typescript
// standalone-agent/src/index.ts
import { AgentRuntime } from '@elizaos/core'
import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite'
import { A2AClient } from '@babylon/a2a-client'
import { babylonPlugin } from '@babylon/agent-plugin'
import { autonomousCoordinatorA2A } from './autonomous'

async function runStandaloneAgent() {
  // 1. Create local database adapter (agent's own SQLite)
  const db = new SqliteDatabaseAdapter({
    dataDir: './agent-data'
  })
  
  // 2. Create runtime with character
  const runtime = new AgentRuntime({
    character: {
      name: 'TradingBot',
      system: 'You are a trading bot...',
      // ...
    },
    agentId: process.env.AGENT_ID!,
    databaseAdapter: db,
    plugins: [babylonPlugin]
  })
  
  // 3. Connect to Babylon via A2A (ONLY external connection)
  const a2aClient = new A2AClient({
    endpoint: process.env.BABYLON_A2A_ENDPOINT!,
    credentials: {
      address: process.env.AGENT_WALLET!,
      privateKey: process.env.AGENT_PRIVATE_KEY!,
      tokenId: parseInt(process.env.AGENT_TOKEN_ID!)
    },
    capabilities: {
      strategies: ['momentum'],
      markets: ['prediction'],
      actions: ['trade', 'social'],
      version: '1.0.0'
    }
  })
  
  await a2aClient.connect()
  runtime.a2aClient = a2aClient
  
  console.log('✅ Standalone agent connected via A2A')
  
  // 4. Run autonomous loop
  setInterval(async () => {
    const result = await autonomousCoordinatorA2A.executeAutonomousTick(
      process.env.AGENT_ID!,
      runtime
    )
    console.log('Tick complete:', result)
  }, 5 * 60 * 1000)  // Every 5 minutes
}

// Run agent
runStandaloneAgent().catch(console.error)
```

**This agent:**
- ✅ Runs independently
- ✅ Has own database (SQLite)
- ✅ Communicates via A2A only
- ✅ No Babylon code imported
- ✅ Can be deployed anywhere

---

## Deployment Scenarios

### Scenario 1: Embedded (Current)

```
┌─────────────────────────┐
│   Babylon Monolith      │
│  ┌────────┐  ┌────────┐ │
│  │ Agents │  │  App   │ │
│  └────────┘  └────────┘ │
│       │          │       │
│       └────┬─────┘       │
│            ▼             │
│       ┌────────┐         │
│       │Database│         │
│       └────────┘         │
└─────────────────────────┘
```

**Current state, works but coupled**

---

### Scenario 2: Separate Process (Next Step)

```
┌────────────┐          ┌────────────┐
│   Agents   │          │  Babylon   │
│  (Separate │◄─A2A────►│    App     │
│   Process) │          │            │
└────────────┘          └──────┬─────┘
      │                        │
      ▼                        ▼
┌────────────┐          ┌────────────┐
│  SQLite    │          │ PostgreSQL │
│(Agent Data)│          │(Babel Data)│
└────────────┘          └────────────┘
```

**Better separation, same infrastructure**

---

### Scenario 3: Separate Infrastructure (Future)

```
┌─────────────────────────┐   ┌─────────────────────────┐
│  Agent Infrastructure   │   │ Babylon Infrastructure  │
│  (Different Cloud/Edge) │   │   (Central Platform)    │
│                         │   │                         │
│  ┌────────┐             │   │        ┌────────┐       │
│  │ Agents │             │   │        │  App   │       │
│  └───┬────┘             │   │        └───┬────┘       │
│      │                  │   │            │             │
│      ▼                  │   │            ▼             │
│  ┌────────┐             │   │     ┌──────────┐        │
│  │ SQLite │             │   │     │PostgreSQL│        │
│  └────────┘             │   │     └────┬─────┘        │
│                         │   │          │              │
└───────────┬─────────────┘   └──────────┼──────────────┘
            │                            │
            │        A2A Protocol        │
            └────────────────────────────┘
                (WebSocket / HTTPS)
```

**Maximum flexibility, true separation**

---

## Testing Separation

### Manual Test

```bash
# 1. Create empty directory
mkdir /tmp/agent-test
cd /tmp/agent-test

# 2. Copy only portable services
cp babylon/src/lib/agents/autonomous/a2a-only/*.ts ./

# 3. Try to run TypeScript compiler
npx tsc --noEmit *.ts

# Should fail ONLY on:
# - Missing @elizaos/core (expected)
# - Missing A2A types (expected)
#
# Should NOT fail on:
# - Missing @/lib/* imports
# - Missing Prisma
# - Missing Babylon services
```

### Automated Test

```bash
npm run verify:separation

# Scans all agent code for:
# ❌ Prisma imports
# ❌ Babylon service imports
# ❌ Babylon utility imports
# ❌ Direct database access

# Shows violations and files needing refactoring
```

---

## Publishable Packages

When agents move to separate project, publish these:

### 1. @babylon/a2a-types

```typescript
// From: src/a2a/types/
export * from './index'
```

### 2. @babylon/a2a-client

```typescript
// From: src/a2a/client/
export { A2AClient } from './a2a-client'
```

### 3. @babylon/agent-plugin

```typescript
// From: src/lib/agents/plugins/babylon/
export { babylonPlugin } from './index'
export type { BabylonRuntime } from './types'
```

### 4. @babylon/erc8004-client

```typescript
// From: src/a2a/blockchain/
export { RegistryClient } from './registry-client'
// ERC-8004 identity and reputation
```

---

## Summary

### Current Status

```
🔴 Old Services (autonomous/):
   - 8 services with Babylon dependencies
   - Cannot be separated
   - Tightly coupled

🟢 New Services (autonomous/a2a-only/):
   - 3 services refactored (Coordinator, Posting, Commenting)
   - Zero Babylon dependencies
   - Fully portable
   - Can run in separate project

🟡 Remaining Work:
   - 5 more services to refactor
   - 3 A2A methods to add
   - Publish packages for separation
```

### Vision

```
TODAY:
Agents embedded in Babylon codebase
Direct database access
Tightly coupled

TOMORROW:
Agents in separate project
A2A protocol communication
Loosely coupled
Deployable anywhere
```

---

## Action Items

### Immediate

1. ✅ Audit complete (see 🚨_SEPARATION_AUDIT.md)
2. ✅ Created 3 A2A-only services
3. ✅ Created verification tool
4. ✅ Documented architecture

### Next Steps

1. Create remaining A2A-only services
2. Add missing A2A methods to protocol
3. Test running A2A-only services
4. Switch production to use A2A-only
5. Deprecate old services
6. Extract and publish packages
7. Create standalone agent project
8. Migrate agents to separate infrastructure

---

**The path to portable, protocol-based agents is clear.** 🎯

See `autonomous/a2a-only/` for working examples of truly portable services!

