# Missing A2A Methods for Full Agent Portability

## Overview

For agents to be fully portable (run in separate project), we need a few additional A2A methods that currently don't exist or aren't properly exposed.

---

## Required New Methods

### 1. Get Agent Configuration

**Method:** `a2a.getAgentConfig`

**Purpose:** Get agent's autonomous behavior settings without database access

**Params:**
```typescript
{
  agentId: string
}
```

**Returns:**
```typescript
{
  agentId: string
  isAgent: boolean
  autonomousTrading: boolean
  autonomousPosting: boolean
  autonomousCommenting: boolean
  autonomousDMs: boolean
  autonomousGroupChats: boolean
  autonomousMessaging: boolean
  modelTier: 'free' | 'pro'
  tradingStrategy?: string
  system?: string
  messageExamples?: string
  style?: string
}
```

**Why needed:**
- Agents need to know their own configuration
- Currently requires `prisma.user.findUnique()`
- Should be available via A2A protocol

**Where to add:**
```typescript
// In src/a2a/types/index.ts
GET_AGENT_CONFIG = 'a2a.getAgentConfig',

// In src/a2a/server/validation.ts
export const GetAgentConfigParamsSchema = z.object({
  agentId: z.string()
})

// In src/a2a/server/message-router.ts
case A2AMethod.GET_AGENT_CONFIG:
  return await this.handleGetAgentConfig(agentId, request)
```

**Handler implementation:**
```typescript
private async handleGetAgentConfig(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  this.logRequest(agentId, A2AMethod.GET_AGENT_CONFIG)
  
  const parseResult = GetAgentConfigParamsSchema.safeParse(request.params)
  if (!parseResult.success) {
    return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params')
  }
  const params = parseResult.data
  
  const agent = await prisma.user.findUnique({
    where: { id: params.agentId },
    select: {
      id: true,
      isAgent: true,
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      autonomousDMs: true,
      autonomousGroupChats: true,
      autonomousMessaging: true,
      agentModelTier: true,
      agentTradingStrategy: true,
      agentSystem: true,
      agentMessageExamples: true,
      agentStyle: true
    }
  })
  
  if (!agent || !agent.isAgent) {
    return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Agent not found')
  }
  
  return {
    jsonrpc: '2.0',
    result: {
      agentId: agent.id,
      isAgent: agent.isAgent,
      autonomousTrading: agent.autonomousTrading,
      autonomousPosting: agent.autonomousPosting,
      autonomousCommenting: agent.autonomousCommenting,
      autonomousDMs: agent.autonomousDMs,
      autonomousGroupChats: agent.autonomousGroupChats,
      autonomousMessaging: agent.autonomousMessaging,
      modelTier: agent.agentModelTier,
      tradingStrategy: agent.agentTradingStrategy,
      system: agent.agentSystem,
      messageExamples: agent.agentMessageExamples,
      style: agent.agentStyle
    } as unknown as JsonRpcResult,
    id: request.id
  }
}
```

---

### 2. Get User's Posts (Filter Feed by Author)

**Method:** `a2a.getUserPosts` OR extend `a2a.getFeed`

**Purpose:** Get posts created by specific user (for agent context)

**Option A - New Method:**
```typescript
// Method: a2a.getUserPosts
// Params:
{
  userId: string
  limit?: number
  offset?: number
}

// Returns:
{
  posts: Post[]
  total: number
  hasMore: boolean
}
```

**Option B - Extend getFeed:**
```typescript
// Update GetFeedParamsSchema to include userId filter
export const GetFeedParamsSchema = z.object({
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0),
  type: z.enum(['post', 'prediction', 'perp_trade', 'agent']).optional(),
  userId: z.string().optional() // Add this
})

// In handleGetFeed, filter by userId if provided
const posts = await prisma.post.findMany({
  where: {
    type: params.type || undefined,
    authorId: params.userId || undefined // Add this filter
  },
  // ... rest
})
```

**Why needed:**
- Agents need their own post history for context
- Currently requires direct database query
- Used in autonomous posting to avoid repetition

---

### 3. Get Agent Performance Metrics

**Method:** `a2a.getAgentPerformance`

**Purpose:** Get agent's trading performance without database access

**Params:**
```typescript
{
  agentId: string
}
```

**Returns:**
```typescript
{
  agentId: string
  lifetimePnL: number
  totalTrades: number
  profitableTrades: number
  winRate: number
  avgTradeSize: number
  maxDrawdown?: number
  sharpeRatio?: number
}
```

**Why needed:**
- Agents reference their own performance in posts
- Currently requires `prisma.user` and `prisma.agentTrade`
- Should be available via A2A

---

### 4. Get Agent Trade History (Already Exists ✅)

**Method:** `a2a.getTradeHistory` ✅

Already implemented, but verify params:
```typescript
{
  userId: string
  limit?: number
}
```

This covers what agents need for trade context.

---

### 5. Store Agent Action Log

**Method:** `a2a.logAgentAction`

**Purpose:** Store agent actions for audit trail

**Params:**
```typescript
{
  agentId: string
  actionType: 'trade' | 'post' | 'comment' | 'message'
  actionId: string
  metadata?: Record<string, any>
}
```

**Returns:**
```typescript
{
  success: boolean
  logId: string
}
```

**Why needed:**
- Agents should be able to log their actions
- Currently uses `prisma.agentLog.create()`
- Useful for debugging and monitoring

**Alternative:**
- Agents can just store this locally in plugin-sql
- A2A logging might be overkill
- Consider optional

---

## Implementation Priority

### Priority 1 (REQUIRED for portability)

1. ✅ `a2a.getAgentConfig` - Agent needs to know its own settings
2. ✅ `a2a.getUserPosts` OR extend `getFeed` with `userId` - Agent needs post history

### Priority 2 (Nice to have)

3. 🔄 `a2a.getAgentPerformance` - Can work around with trade history
4. 🔄 `a2a.logAgentAction` - Can use plugin-sql instead

---

## Quick Implementation

### Add to A2A Protocol

#### 1. Update Types (src/a2a/types/index.ts)

```typescript
export enum A2AMethod {
  // ... existing methods ...
  
  // Agent Management (NEW)
  GET_AGENT_CONFIG = 'a2a.getAgentConfig',
  GET_USER_POSTS = 'a2a.getUserPosts',
  GET_AGENT_PERFORMANCE = 'a2a.getAgentPerformance',
}
```

#### 2. Add Validation Schemas (src/a2a/server/validation.ts)

```typescript
export const GetAgentConfigParamsSchema = z.object({
  agentId: z.string()
})

export const GetUserPostsParamsSchema = z.object({
  userId: z.string(),
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0)
})

export const GetAgentPerformanceParamsSchema = z.object({
  agentId: z.string()
})
```

#### 3. Add Handlers (src/a2a/server/message-router.ts)

```typescript
// In route() switch statement
case A2AMethod.GET_AGENT_CONFIG:
  return await this.handleGetAgentConfig(agentId, request)
case A2AMethod.GET_USER_POSTS:
  return await this.handleGetUserPosts(agentId, request)
case A2AMethod.GET_AGENT_PERFORMANCE:
  return await this.handleGetAgentPerformance(agentId, request)

// Add handler methods (see implementation above)
```

---

## Workarounds (Until Methods Added)

### For Agent Config

```typescript
// Store in agent's local DB on initialization
if (runtime.databaseAdapter) {
  await runtime.databaseAdapter.createMemory({
    userId: runtime.agentId,
    content: {
      type: 'agent_config',
      autonomousTrading: true,
      autonomousPosting: true,
      // ...
    },
    roomId: runtime.agentId
  })
}

// Retrieve from local DB
const configMemory = await runtime.databaseAdapter.getMemories({
  roomId: runtime.agentId,
  count: 1,
  unique: false
})
const config = configMemory.find(m => m.content.type === 'agent_config')
```

### For User's Posts

```typescript
// Get all feed and filter client-side
const feed = await runtime.a2aClient.sendRequest('a2a.getFeed', { limit: 50 })
const myPosts = feed.posts.filter(p => p.author.id === agentUserId)
```

**Not ideal, but works until method added.**

---

## Verification

After adding methods, verify:

```bash
# Run separation check
npm run verify:separation

# Should show zero violations in a2a-only/ directory
```

---

## Timeline

### Week 1
- ✅ Audit complete
- ✅ Create 3 A2A-only services
- ✅ Document architecture
- 🔄 Add 2 critical A2A methods

### Week 2
- Create remaining A2A-only services
- Test portability
- Switch to A2A-only in production

### Week 3
- Extract packages
- Test standalone deployment
- Full separation achieved

---

**Adding these methods unlocks true agent portability!** 🔓

