# Crucible × Babylon × Agent0 Implementation Roadmap

## Executive Summary
This document outlines the complete implementation plan for integrating ElizaOS agents with Babylon game via Agent0 SDK (ERC-8004 registry). Agents will discover Babylon on-chain, register themselves, connect via A2A protocol, and play the game autonomously.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Crucible Application                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Agent UI    │  │  Provisioner │  │  Docker Mgr  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             ElizaOS Agent Runtime (Docker Container)             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  plugin-babylon                                           │  │
│  │    • Agent0Service (ERC-8004 integration)                │  │
│  │    • BabylonA2AService (WebSocket client)                │  │
│  │    • BabylonDiscoveryService (finds Babylon on registry) │  │
│  │    • Trading Actions (BuyShares, OpenPosition, etc)      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent0 SDK / ERC-8004                         │
│    • On-chain identity registry (Base Sepolia)                   │
│    • Agent registration & discovery                              │
│    • Reputation & feedback system                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Babylon Game Server                         │
│    • A2A WebSocket endpoint                                      │
│    • Prediction markets                                          │
│    • Perpetual futures trading                                   │
│    • Social feed & messaging                                     │
└─────────────────────────────────────────────────────────────────┘
```

## File-by-File Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 src/agents/agent0/Agent0Client.ts
**Changes:**
- Remove all `try-catch` blocks - fail fast instead
- Remove null checks on critical data - assert expectations
- Add explicit throws for invalid states
- Simplify error paths to propagate immediately

**Implementation:**
```typescript
// Remove: if (!this.sdk) return null
// Add: throw if SDK not initialized
```

#### 1.2 src/agents/agent0/SubgraphClient.ts
**Changes:**
- Remove stub GraphQLClient class
- Install and use real `graphql-request`
- Add typed GraphQL query builders
- Implement pagination for large result sets
- Add retry logic with exponential backoff

**Dependencies:**
```bash
cd /Users/shawwalters/babylon
bun add graphql-request graphql
```

#### 1.3 src/services/WalletProvisioner.ts (NEW)
**Purpose:** Create and fund agent wallets using Privy
**Responsibilities:**
- Request Privy embedded wallet creation
- Fund from sponsor wallet
- Return private key + address
- Track provisioned wallets

**Dependencies:**
- `@privy-io/server-auth`
- `viem` for wallet operations

#### 1.4 src/services/SponsorWallet.ts (NEW)
**Purpose:** Manage sponsor wallet for gas payments
**Responsibilities:**
- Load sponsor private key from env
- Check balance
- Transfer ETH to agent wallets
- Log all sponsorship transactions

### Phase 2: Discovery & A2A

#### 2.1 src/agents/agent0/BabylonDiscoveryService.ts (NEW)
**Purpose:** Find Babylon on Agent0 registry
**Responsibilities:**
- Query subgraph for agents with type='game-platform' and name='Babylon'
- Cache discovered endpoints
- Re-query on failure
- Validate endpoint connectivity

**Key Methods:**
```typescript
async findBabylon(): Promise<BabylonEndpoints | null>
async validateEndpoints(endpoints: BabylonEndpoints): Promise<boolean>
```

#### 2.2 src/agents/agent0/UnifiedDiscovery.ts
**Changes:**
- Import and instantiate BabylonDiscoveryService
- Add `findBabylon()` method that delegates to BabylonDiscoveryService
- Cache Babylon endpoints in runtime settings

#### 2.3 src/a2a/client/a2a-client.ts
**Changes:**
- Make endpoint URL dynamic (accept from constructor)
- Add signed authentication handshake
- Implement message signing with agent private key
- Add session state getters for persistence

#### 2.4 plugin-babylon/src/a2a-service.ts
**Changes:**
- Auto-discover Babylon endpoint via Agent0Service
- Implement signed WebSocket auth
- Add session state persistence helpers
- Load/save session on Docker restart

### Phase 3: Plugin Updates

#### 3.1 plugin-babylon/src/agent0-service.ts
**Changes:**
- Call discovery on init
- Store Babylon endpoints in runtime.setSetting
- Expose discovery methods to other services
- Add feedback submission helpers

#### 3.2 plugin-babylon/src/actions/register-agent.ts (NEW)
**Purpose:** Action to register agent on Agent0
**Handler:**
- Get agent character from runtime
- Extract capabilities from plugins
- Call Agent0Client.registerAgent
- Store tokenId in runtime state

#### 3.3 plugin-babylon/src/actions/discover-babylon.ts (NEW)
**Purpose:** Action to find and connect to Babylon
**Handler:**
- Call BabylonDiscoveryService.findBabylon()
- Update runtime settings with endpoints
- Trigger A2A connection

#### 3.4 plugin-babylon/src/actions/buy-shares.ts (NEW)
**Purpose:** Buy prediction market shares
**Validate:** Check balance, question exists
**Handler:** Send trade message via A2A

#### 3.5 plugin-babylon/src/actions/open-position.ts (NEW)
**Purpose:** Open leveraged perp position
**Validate:** Check balance, ticker exists
**Handler:** Send position message via A2A

#### 3.6 plugin-babylon/src/actions/post-feed.ts (NEW)
**Purpose:** Post to Babylon social feed
**Validate:** Content not empty
**Handler:** Send post via A2A

#### 3.7 plugin-babylon/src/actions/send-dm.ts (NEW)
**Purpose:** Send direct message
**Handler:** Send DM via A2A

### Phase 4: Crucible Backend

#### 4.1 crucible/packages/server/src/api/agents/provision.ts (NEW)
**Endpoints:**
```
POST /api/agents/provision
  - Create Privy wallet
  - Fund from sponsor
  - Return credentials

GET /api/agents/:id/credentials
  - Retrieve agent credentials
```

#### 4.2 crucible/packages/server/src/api/agents/management.ts (NEW)
**Endpoints:**
```
POST /api/agents/:id/start
  - Launch Docker container
  - Stream logs

POST /api/agents/:id/stop
  - Graceful shutdown

GET /api/agents/:id/status
  - Container status
  - Resource usage
```

#### 4.3 crucible/packages/server/src/services/DockerManager.ts (NEW)
**Responsibilities:**
- Build agent images
- Launch containers with env injection
- Monitor container health
- Collect logs and metrics

### Phase 5: Docker

#### 5.1 crucible/packages/agentserver/Dockerfile
**Updates:**
- Multi-stage build
- Include ElizaOS runtime
- Bundle plugin-babylon
- Expose WebSocket port

#### 5.2 crucible/docker-compose.agents.yml (NEW)
**Services:**
- agent-{persona-name} for each default persona
- Shared network
- Volume mounts for persistence

#### 5.3 crucible/packages/agentserver/supervisor.sh (NEW)
**Responsibilities:**
- Start ElizaOS runtime
- Monitor process health
- Auto-restart on crash
- Forward signals

### Phase 6: Character Files

#### 6.1 Update All Personas
**Files:**
- crucible/characters/citizen.json
- crucible/characters/guardian.json
- crucible/characters/hacker.json
- crucible/characters/player.json
- crucible/characters/scammer.json

**Additions:**
```json
{
  "plugins": ["@babylonai/plugin-babylon"],
  "settings": {
    "AGENT0_ENABLED": "true",
    "BABYLON_AUTO_DISCOVER": "true",
    "BABYLON_AUTO_REGISTER": "true"
  },
  "goals": [
    "Register on Agent0 network",
    "Discover and connect to Babylon game",
    "Play Babylon actively and skillfully"
  ]
}
```

#### 6.2 Add Persona-Specific Strategies
- Citizen: Conservative trader
- Guardian: Risk-averse, protective
- Hacker: Exploits inefficiencies
- Player: Balanced, social
- Scammer: High risk, manipulative

### Phase 7: Crucible Frontend

#### 7.1 crucible/packages/game/src/components/AgentWizard.tsx (NEW)
**Features:**
- Select persona
- Preview capabilities
- Configure strategy
- Initiate provisioning
- Show registration progress

#### 7.2 crucible/packages/game/src/components/AgentDashboard.tsx (NEW)
**Features:**
- List all agents
- Status indicators
- PnL charts
- Activity feed
- Start/stop controls

#### 7.3 crucible/packages/game/src/components/AgentTelemetry.tsx (NEW)
**Features:**
- Real-time balance
- Open positions
- Recent trades
- Feed posts
- Connection status

### Phase 8: Testing

#### 8.1 tests/e2e/agent-provisioning.spec.ts (NEW)
**Tests:**
- Create Privy wallet
- Fund from sponsor
- Verify balance
- Store credentials

#### 8.2 tests/e2e/agent0-registration.spec.ts (NEW)
**Tests:**
- Register agent on-chain
- Verify token minted
- Check subgraph indexing
- Retrieve agent profile

#### 8.3 tests/e2e/babylon-discovery.spec.ts (NEW)
**Tests:**
- Query Agent0 for Babylon
- Validate endpoints
- Test connectivity
- Cache results

#### 8.4 tests/e2e/a2a-connection.spec.ts (NEW)
**Tests:**
- Connect to A2A endpoint
- Authenticate with signature
- Send message
- Receive response

#### 8.5 tests/e2e/babylon-trading.spec.ts (NEW)
**Tests:**
- Buy prediction shares
- Open perp position
- Check balance update
- Verify trade history

#### 8.6 tests/e2e/babylon-social.spec.ts (NEW)
**Tests:**
- Post to feed
- Send DM
- Join group chat
- Follow user

#### 8.7 tests/integration/subgraph-client.test.ts (NEW)
**Tests:**
- Mock GraphQL responses
- Test pagination
- Test error handling
- Test type parsing

#### 8.8 tests/integration/agent0-client.test.ts (NEW)
**Tests:**
- Mock SDK calls
- Test registration flow
- Test search
- Test feedback

#### 8.9 tests/integration/wallet-provisioner.test.ts (NEW)
**Tests:**
- Mock Privy API
- Test wallet creation
- Test funding
- Test error cases

#### 8.10 tests/integration/babylon-discovery.test.ts (NEW)
**Tests:**
- Mock subgraph
- Test endpoint validation
- Test caching
- Test failure recovery

#### 8.11 tests/integration/a2a-reconnect.test.ts (NEW)
**Tests:**
- Simulate disconnect
- Test reconnection
- Test message queuing
- Test state recovery

#### 8.12 tests/docker/multi-agent.test.ts (NEW)
**Tests:**
- Launch 3 agents
- Verify all connect
- Test inter-agent discovery
- Verify isolation

### Phase 9: Validation

#### 9.1 Run All Tests
```bash
cd /Users/shawwalters/babylon
bun test  # Unit + integration
cd crucible
bun test  # Crucible tests
```

#### 9.2 Fix TypeScript Errors
```bash
cd /Users/shawwalters/babylon
bun run typecheck
cd plugin-babylon
bun run type-check
cd ../crucible
bun run typecheck
```

#### 9.3 Fix ESLint
```bash
cd /Users/shawwalters/babylon
bun run lint
cd plugin-babylon
bun run lint
cd ../crucible
bun run lint
```

#### 9.4 Verify Builds
```bash
cd /Users/shawwalters/babylon
bun run build
cd plugin-babylon
bun run build
cd ../crucible
bun run build
```

### Phase 10: Documentation

#### 10.1 crucible/README_AGENTS.md (NEW)
- Setup instructions
- Configuration guide
- Persona descriptions
- Troubleshooting

#### 10.2 crucible/.env.example.agents (NEW)
```bash
# Agent0 / ERC-8004
AGENT0_ENABLED=true
AGENT0_NETWORK=sepolia
AGENT0_SUBGRAPH_URL=...
BASE_SEPOLIA_RPC_URL=...

# Sponsor Wallet
SPONSOR_PRIVATE_KEY=...

# Privy
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...

# Babylon
BABYLON_A2A_ENDPOINT=  # Auto-discovered
```

#### 10.3 crucible/DEPLOYMENT.md (NEW)
- Production checklist
- Docker deployment
- Monitoring setup
- Security considerations

## Implementation Order

1. **Core Infrastructure (Phase 1)** - Foundation for everything else
2. **Discovery & A2A (Phase 2)** - Required for agent-Babylon communication
3. **Plugin Updates (Phase 3)** - Expose capabilities to agents
4. **Docker (Phase 5)** - Required for testing and deployment
5. **Character Files (Phase 6)** - Configure agent behaviors
6. **Testing (Phase 8)** - Validate all components
7. **Crucible Backend (Phase 4)** - Management layer
8. **Crucible Frontend (Phase 7)** - User interface
9. **Validation (Phase 9)** - Ensure everything works
10. **Documentation (Phase 10)** - Knowledge transfer

## Success Criteria

- [ ] Agent registers on Agent0 automatically
- [ ] Agent discovers Babylon via registry
- [ ] Agent connects to Babylon A2A endpoint
- [ ] Agent authenticates successfully
- [ ] Agent can read Babylon feed
- [ ] Agent can post to Babylon feed
- [ ] Agent can buy prediction market shares
- [ ] Agent can open leveraged positions
- [ ] All tests pass (unit, integration, E2E)
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] All packages build successfully
- [ ] Multi-agent Docker scenario works
- [ ] Crucible UI can manage agents

## Risk Mitigation

1. **Blockchain Dependency:** Test with local hardhat fork
2. **API Rate Limits:** Implement backoff and caching
3. **Container Crashes:** Supervisor with auto-restart
4. **Fund Depletion:** Monitor sponsor balance, alert
5. **Bad Trades:** Position limits, confidence thresholds
6. **Data Loss:** Persistent volumes, state backups

## Timeline Estimate

- Phase 1-3: Core implementation (60-80 tool calls)
- Phase 4-7: Application layer (40-60 tool calls)
- Phase 8: Testing (50-70 tool calls)
- Phase 9-10: Validation & docs (20-30 tool calls)

**Total:** ~200-250 tool calls for complete implementation

---

**Current Status:** Phase 1 - Task 1 in progress
**Last Updated:** 2025-01-12

