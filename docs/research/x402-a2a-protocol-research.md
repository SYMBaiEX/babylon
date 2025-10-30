# x402 Protocol & Agent-to-Agent (A2A) Communication Research Report

**Research Date:** October 29, 2025
**Focus:** Protocol specifications, implementation patterns, and integration strategies for multiplayer game with human + AI agents

---

## Executive Summary

This report provides comprehensive analysis of three interconnected protocols for agent communication and trust:

1. **x402 Protocol** - HTTP-native micropayment protocol for autonomous agent transactions
2. **A2A Protocol** (Agent-to-Agent) - Communication standard for agent interoperability
3. **ERC-8004** - Blockchain-based trust and discovery layer for agents

These protocols form a complementary stack enabling:
- **Discovery**: Finding agents and their capabilities (ERC-8004, A2A Agent Cards)
- **Communication**: Structured agent-to-agent messaging (A2A via JSON-RPC 2.0)
- **Trust**: Reputation and validation systems (ERC-8004 registries)
- **Payments**: Instant micropayments for agent services (x402)

---

## 1. x402 Protocol: Internet-Native Payments

### 1.1 Overview

x402 is an open payment protocol developed by Coinbase that enables instant, automatic stablecoin payments directly over HTTP by reviving the HTTP 402 "Payment Required" status code.

**Key Characteristics:**
- Chain agnostic (currently focuses on Base network with USDC)
- HTTP-native using standard request/response structure
- Zero intermediary fees via Coinbase Developer Platform facilitator
- Supports payments as low as $0.001
- 2-second settlement time

### 1.2 Core Architecture

#### Components

```
┌─────────┐         ┌──────────────┐         ┌─────────────┐
│ Client  │ ←─402──→│ Resource     │ ←──────→│ Facilitator │
│ (Agent) │         │ Server       │  Verify │ Server      │
└─────────┘         └──────────────┘  Settle └─────────────┘
```

**Client**: Human or AI agent requesting paid resources
**Resource Server**: API/service provider monetizing endpoints
**Facilitator Server**: Handles payment verification and blockchain settlement

#### Request Flow

```typescript
// 1. Client requests resource without payment
GET /api/weather HTTP/1.1
Host: api.example.com

// 2. Server responds with 402 Payment Required
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453", // Base
    "maxAmountRequired": "10000", // $0.01 in atomic units
    "resource": "/api/weather",
    "description": "Current weather data",
    "mimeType": "application/json",
    "payTo": "0xRecipientAddress",
    "maxTimeoutSeconds": 30,
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    "extra": {
      "name": "USD Coin",
      "version": "2"
    }
  }]
}

// 3. Client sends request with payment payload
GET /api/weather HTTP/1.1
Host: api.example.com
X-PAYMENT: base64(JSON({
  "x402Version": 1,
  "scheme": "exact",
  "network": "eip155:8453",
  "payload": {
    // EIP-3009 transfer authorization signature
    "from": "0xClientAddress",
    "to": "0xRecipientAddress",
    "value": "10000",
    "validAfter": 0,
    "validBefore": 1735344000,
    "nonce": "0x...",
    "v": 28,
    "r": "0x...",
    "s": "0x..."
  }
}))

// 4. Server verifies and settles payment, returns resource
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: base64(JSON({
  "success": true,
  "txHash": "0x...",
  "networkId": "eip155:8453"
}))

{
  "temperature": 72,
  "conditions": "sunny"
}
```

### 1.3 Implementation Guide

#### Server-Side Integration (Express.js)

```typescript
import express from 'express';
import { paymentMiddleware } from '@x402/server-express';

const app = express();

// Single line to enable x402 payments
app.use(
  paymentMiddleware("0xYourWalletAddress", {
    "/api/weather": "$0.01",
    "/api/forecast": "$0.05",
    "/api/historical": "$0.10"
  })
);

app.get('/api/weather', (req, res) => {
  // Payment already verified by middleware
  res.json({ temperature: 72, conditions: "sunny" });
});

app.listen(3000);
```

#### Client-Side Integration

```typescript
import { X402Client } from '@x402/client';

const client = new X402Client({
  privateKey: process.env.PRIVATE_KEY,
  network: 'base', // Base network
  facilitatorUrl: 'https://x402-facilitator.cdp.coinbase.com'
});

// Automatic payment handling
const response = await client.get('https://api.example.com/api/weather');
// Client automatically:
// 1. Detects 402 response
// 2. Signs payment authorization
// 3. Retries with X-PAYMENT header
// 4. Returns final response
```

### 1.4 Facilitator Server

**Coinbase Developer Platform Facilitator:**
- URL: `https://x402-facilitator.cdp.coinbase.com`
- Zero fees for USDC transactions on Base
- Handles verification and settlement
- No blockchain infrastructure needed by servers

**Endpoints:**
```
POST /verify   - Verify payment signature without settlement
POST /settle   - Execute on-chain payment
GET /supported - List supported (scheme, network) pairs
```

### 1.5 Payment Schemes

**Current: "exact" scheme**
- Fixed payment amount per request
- EIP-3009 `receiveWithAuthorization` on EVM chains
- Client signs authorization, facilitator executes

**Future schemes (extensible):**
- `upto`: Pay based on resources consumed (e.g., LLM tokens generated)
- `subscription`: Time-based access
- `credit`: Pre-funded account

### 1.6 Security Considerations

**For Servers:**
- Always verify payment before processing requests
- Use facilitator for verification to avoid wallet exposure
- Implement rate limiting per address
- Log all payment attempts for audit

**For Clients:**
- Verify HTTPS and certificate validity
- Check payment requirements before signing
- Implement spending limits
- Monitor transaction receipts

### 1.7 Integration with Game Server

```typescript
// Game server with x402 integration
import { X402Server } from '@x402/server';

const x402 = new X402Server({
  walletAddress: process.env.GAME_TREASURY_ADDRESS,
  facilitatorUrl: 'https://x402-facilitator.cdp.coinbase.com',
  network: 'base'
});

// Pricing structure
const pricing = {
  "/api/game/move": "$0.001",        // Per move
  "/api/game/state": "$0.0001",      // Game state query
  "/api/game/ai-assist": "$0.01",    // AI assistance
  "/api/game/replay": "$0.005"       // Replay generation
};

app.use(x402.middleware(pricing));
```

---

## 2. Agent-to-Agent (A2A) Protocol

### 2.1 Overview

A2A Protocol (v0.3.0) is an open standard developed by Google (now managed by Linux Foundation) that enables AI agents to communicate and collaborate across different platforms and frameworks.

**Key Features:**
- JSON-RPC 2.0 over HTTP(S) (primary transport)
- gRPC and REST support
- Server-Sent Events (SSE) for streaming
- WebSocket support for push notifications
- Task lifecycle management
- Secure, enterprise-ready authentication

### 2.2 Core Concepts

#### Agent Card (Discovery Document)

```json
{
  "name": "Weather Assistant",
  "description": "Provides real-time weather data and forecasts",
  "url": "https://weather.agent.example/.well-known/agent-card.json",
  "authentication": {
    "schemes": ["Bearer"],
    "authorization": {
      "type": "oauth2",
      "flows": {
        "clientCredentials": {
          "tokenUrl": "https://auth.example.com/oauth/token",
          "scopes": {
            "weather:read": "Read weather data"
          }
        }
      }
    }
  },
  "capabilities": {
    "streaming": true,
    "pushNotifications": true
  },
  "skills": [
    {
      "id": "get-current-weather",
      "name": "Get Current Weather",
      "description": "Returns current weather for a location",
      "inputMode": {
        "type": "text",
        "schema": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          }
        }
      },
      "outputMode": {
        "type": "text"
      },
      "examples": [
        {
          "input": "What's the weather in San Francisco?",
          "output": "Currently 68°F and sunny in San Francisco"
        }
      ]
    }
  ]
}
```

#### Message Structure

```typescript
interface Message {
  role: 'user' | 'agent';
  parts: Part[];
}

type Part =
  | TextPart
  | FilePart
  | DataPart;

interface TextPart {
  type: 'text';
  text: string;
}

interface FilePart {
  type: 'file';
  url: string;
  mimeType: string;
  name?: string;
}

interface DataPart {
  type: 'data';
  data: object;
  mimeType: 'application/json';
}
```

#### Task Lifecycle

```
┌─────────────┐
│   PENDING   │ ← Task created
└──────┬──────┘
       ↓
┌─────────────┐
│   WORKING   │ ← Agent processing
└──────┬──────┘
       ↓
   ┌───────┐
   │SUCCESS│ ← Completed with artifacts
   └───────┘
       OR
   ┌───────┐
   │FAILED │ ← Error occurred
   └───────┘
       OR
   ┌────────┐
   │CANCELED│ ← Client canceled
   └────────┘
```

### 2.3 Transport Protocols

#### JSON-RPC 2.0 (Primary)

```typescript
// Send message request
POST /v1/a2a HTTP/1.1
Host: agent.example.com
Content-Type: application/json
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "What's the weather in Tokyo?"
        }
      ]
    },
    "context": "ctx-456" // Optional: groups related tasks
  }
}

// Response with task ID
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "result": {
    "taskId": "task-789",
    "status": "WORKING",
    "message": {
      "role": "agent",
      "parts": [
        {
          "type": "text",
          "text": "Looking up weather data for Tokyo..."
        }
      ]
    }
  }
}
```

#### Streaming (SSE)

```typescript
// Request streaming response
POST /v1/a2a HTTP/1.1
Host: agent.example.com
Content-Type: application/json
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "type": "text", "text": "Generate a story" }]
    }
  }
}

// Server responds with SSE stream
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"jsonrpc":"2.0","id":"req-123","result":{"taskId":"task-789","status":"WORKING"}}

data: {"jsonrpc":"2.0","id":"req-123","result":{"taskId":"task-789","status":"WORKING","artifact":{"parts":[{"type":"text","text":"Once upon"}]}}}

data: {"jsonrpc":"2.0","id":"req-123","result":{"taskId":"task-789","status":"WORKING","artifact":{"parts":[{"type":"text","text":" a time"}]}}}

data: {"jsonrpc":"2.0","id":"req-123","result":{"taskId":"task-789","status":"SUCCESS","artifact":{"parts":[{"type":"text","text":"..."}]}}}
```

#### Push Notifications (WebHooks)

```typescript
// Client registers webhook for long-running tasks
{
  "jsonrpc": "2.0",
  "method": "tasks/pushNotificationConfig/set",
  "params": {
    "taskId": "task-789",
    "config": {
      "webhookUrl": "https://client.example.com/webhook/a2a",
      "events": ["STATUS_CHANGE", "ARTIFACT_UPDATE"]
    }
  }
}

// Server posts updates to webhook
POST /webhook/a2a HTTP/1.1
Host: client.example.com
Content-Type: application/json

{
  "taskId": "task-789",
  "status": "SUCCESS",
  "artifact": {
    "parts": [
      {
        "type": "text",
        "text": "Task completed successfully"
      }
    ]
  }
}
```

### 2.4 Authentication Flow

```
┌────────┐                          ┌─────────────┐
│ Client │                          │ A2A Server  │
└───┬────┘                          └──────┬──────┘
    │                                      │
    │ 1. Discover Agent Card               │
    ├────────────────────────────────────→ │
    │    GET /.well-known/agent-card.json  │
    │                                      │
    │ 2. Agent Card with auth requirements │
    │ ←────────────────────────────────────┤
    │    { authentication: { schemes: [...] } }
    │                                      │
    │ 3. Obtain credentials (out-of-band) │
    │    OAuth2, API Key, etc.            │
    │                                      │
    │ 4. Send request with credentials    │
    ├────────────────────────────────────→ │
    │    Authorization: Bearer <token>    │
    │                                      │
    │ 5. Server validates & processes     │
    │                                      │
    │ 6. Response                          │
    │ ←────────────────────────────────────┤
    │                                      │
```

### 2.5 Security Best Practices

**Transport Security:**
- MUST use HTTPS (TLS 1.3+ recommended)
- Validate TLS certificates
- Support modern cipher suites

**Authentication:**
- Support OAuth 2.0, Bearer tokens, API keys
- Include authentication in every request (HTTP headers)
- Implement 401 Unauthorized with WWW-Authenticate header
- Support mTLS for high-security scenarios

**Authorization:**
- Validate permissions for every operation
- Use 403 Forbidden for authorization failures
- Implement role-based access control (RBAC)

**Webhook Security:**
- Validate webhook URL ownership
- Use HTTPS for webhook endpoints
- Implement webhook signature verification
- Support webhook retry with exponential backoff

### 2.6 Implementation Libraries

**Python:**
```bash
pip install a2a-json-rpc python-a2a
```

**TypeScript/Node.js:**
```bash
npm install @a2aproject/client @a2aproject/server
```

**Java:**
```bash
# Maven
<dependency>
  <groupId>ai.a2a</groupId>
  <artifactId>a2a-java-sdk</artifactId>
  <version>0.3.0</version>
</dependency>
```

### 2.7 Game Server Integration

```typescript
import { A2AServer, A2AClient } from '@a2aproject/server';

// Server: Expose game state as A2A agent
const gameAgent = new A2AServer({
  name: "Babylon Game Agent",
  url: "https://game.babylon.ai/.well-known/agent-card.json",
  authentication: {
    schemes: ["Bearer"],
    validator: async (token) => {
      // Validate JWT or API key
      return { playerId: "player-123", agentId: "agent-456" };
    }
  },
  skills: [
    {
      id: "make-move",
      name: "Make Game Move",
      handler: async (params, context) => {
        const { position, playerId } = params;
        // Process move
        return {
          status: "SUCCESS",
          artifact: {
            parts: [
              { type: "data", data: { newState: {...} } }
            ]
          }
        };
      }
    },
    {
      id: "query-state",
      name: "Query Game State",
      handler: async (params, context) => {
        const { gameId } = params;
        const state = await getGameState(gameId);
        return {
          status: "SUCCESS",
          artifact: {
            parts: [
              { type: "data", data: state }
            ]
          }
        };
      }
    }
  ]
});

// Client: Connect to other AI agents
const aiPlayerAgent = new A2AClient({
  agentCardUrl: "https://ai-player.example/.well-known/agent-card.json",
  authentication: {
    type: "Bearer",
    token: process.env.AI_PLAYER_TOKEN
  }
});

// AI agent makes a move
const response = await aiPlayerAgent.sendMessage({
  role: "user",
  parts: [
    {
      type: "text",
      text: "Make your next move in game-123"
    },
    {
      type: "data",
      data: { gameState: currentGameState }
    }
  ]
});
```

---

## 3. ERC-8004: Trustless Agents

### 3.1 Overview

ERC-8004 is an Ethereum standard (Draft status, introduced August 2025) that provides blockchain-based infrastructure for agent discovery, reputation, and validation.

**Purpose:** Enable agents to discover, choose, and interact with each other across organizational boundaries without pre-existing trust.

### 3.2 Three Core Registries

#### 3.2.1 Identity Registry (ERC-721 Based)

```solidity
interface IIdentityRegistry {
  // Register new agent
  function register(
    string memory tokenURI,
    MetadataEntry[] memory metadata
  ) external returns (uint256 agentId);

  // Get/set metadata
  function getMetadata(uint256 agentId, string memory key)
    external view returns (bytes memory);

  function setMetadata(uint256 agentId, string memory key, bytes memory value)
    external;

  // Events
  event Registered(uint256 indexed agentId, string tokenURI, address indexed owner);
  event MetadataSet(uint256 indexed agentId, string indexed key, bytes value);
}
```

**Agent Registration File (JSON):**
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Babylon Game AI",
  "description": "Autonomous AI player for Babylon strategy game",
  "image": "https://babylon.game/agents/ai-player.png",
  "endpoints": [
    {
      "name": "A2A",
      "endpoint": "https://babylon.game/.well-known/agent-card.json",
      "version": "0.3.0"
    },
    {
      "name": "agentWallet",
      "endpoint": "eip155:8453:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
    }
  ],
  "registrations": [
    {
      "agentId": 42,
      "agentRegistry": "eip155:8453:0xIdentityRegistryAddress"
    }
  ],
  "supportedTrust": [
    "reputation",
    "crypto-economic",
    "tee-attestation"
  ]
}
```

**Global Agent Identifier:**
```
eip155:8453:0xIdentityRegistryAddress:42
```
- Namespace: `eip155` (EVM chains)
- Chain ID: `8453` (Base)
- Registry: `0xIdentityRegistryAddress`
- Agent ID: `42`

#### 3.2.2 Reputation Registry

```solidity
interface IReputationRegistry {
  // Give feedback
  function giveFeedback(
    uint256 agentId,
    uint8 score,           // 0-100
    bytes32 tag1,          // Optional category
    bytes32 tag2,          // Optional sub-category
    string calldata fileUri,
    bytes32 calldata fileHash,
    bytes memory feedbackAuth  // Pre-signed by agent
  ) external;

  // Revoke feedback
  function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

  // Append response
  function appendResponse(
    uint256 agentId,
    address clientAddress,
    uint64 feedbackIndex,
    string calldata responseUri,
    bytes32 calldata responseHash
  ) external;

  // Query functions
  function getSummary(
    uint256 agentId,
    address[] calldata clientAddresses,
    bytes32 tag1,
    bytes32 tag2
  ) external view returns (uint64 count, uint8 averageScore);

  function readFeedback(
    uint256 agentId,
    address clientAddress,
    uint64 index
  ) external view returns (
    uint8 score,
    bytes32 tag1,
    bytes32 tag2,
    bool isRevoked
  );

  // Events
  event NewFeedback(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint8 score,
    bytes32 indexed tag1,
    bytes32 tag2,
    string fileUri,
    bytes32 fileHash
  );

  event FeedbackRevoked(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint64 indexed feedbackIndex
  );
}
```

**Feedback Authorization (EIP-191 signature):**
```typescript
interface FeedbackAuth {
  agentId: uint256;
  clientAddress: address;
  indexLimit: uint64;      // Allow multiple feedback submissions
  expiry: uint256;         // Block timestamp
  chainId: uint256;
  identityRegistry: address;
  signerAddress: address;  // Agent owner/operator
}

// Agent pre-signs authorization
const feedbackAuth = await agentWallet.signTypedData({
  domain: {
    name: "ERC8004-Reputation",
    version: "1",
    chainId: 8453,
    verifyingContract: reputationRegistryAddress
  },
  types: {
    FeedbackAuth: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" },
      { name: "indexLimit", type: "uint64" },
      { name: "expiry", type: "uint256" },
      { name: "chainId", type: "uint256" },
      { name: "identityRegistry", type: "address" },
      { name: "signerAddress", type: "address" }
    ]
  },
  message: {
    agentId: 42,
    clientAddress: "0xPlayerAddress",
    indexLimit: 100,
    expiry: Date.now() + 86400000, // 24 hours
    chainId: 8453,
    identityRegistry: "0xIdentityRegistryAddress",
    signerAddress: await agentWallet.getAddress()
  }
});
```

**Feedback File Structure (IPFS):**
```json
{
  "agentRegistry": "eip155:8453:0xIdentityRegistryAddress",
  "agentId": 42,
  "clientAddress": "eip155:8453:0xPlayerAddress",
  "createdAt": "2025-10-29T12:00:00Z",
  "feedbackAuth": "0x...",
  "score": 95,
  "tag1": "gameplay",
  "tag2": "strategy",
  "skill": "make-move",
  "task": "task-789",
  "comments": "Excellent strategic decision-making",
  "proof_of_payment": {
    "fromAddress": "0xPlayerAddress",
    "toAddress": "0xAgentAddress",
    "chainId": "8453",
    "txHash": "0x..."
  }
}
```

#### 3.2.3 Validation Registry

```solidity
interface IValidationRegistry {
  // Request validation
  function validationRequest(
    address validatorAddress,
    uint256 agentId,
    string memory requestUri,
    bytes32 requestHash
  ) external;

  // Submit validation response
  function validationResponse(
    bytes32 requestHash,
    uint8 response,         // 0-100 (0=failed, 100=passed)
    string memory responseUri,
    bytes32 responseHash,
    bytes32 tag
  ) external;

  // Query functions
  function getValidationStatus(bytes32 requestHash)
    external view returns (
      address validatorAddress,
      uint256 agentId,
      uint8 response,
      bytes32 tag,
      uint256 lastUpdate
    );

  function getSummary(
    uint256 agentId,
    address[] calldata validatorAddresses,
    bytes32 tag
  ) external view returns (uint64 count, uint8 avgResponse);

  // Events
  event ValidationRequest(
    address indexed validatorAddress,
    uint256 indexed agentId,
    string requestUri,
    bytes32 indexed requestHash
  );

  event ValidationResponse(
    address indexed validatorAddress,
    uint256 indexed agentId,
    bytes32 indexed requestHash,
    uint8 response,
    string responseUri,
    bytes32 tag
  );
}
```

### 3.3 Trust Models

**1. Reputation-Based:**
- Aggregated feedback from past interactions
- On-chain average scores for composability
- Off-chain sophisticated reputation algorithms
- Sybil-resistant through validator reputation

**2. Crypto-Economic (Staking):**
- Validators stake tokens
- Re-execute agent work
- Slashed if validation fails
- Rewards for correct validation

**3. TEE Attestation:**
- Trusted Execution Environment proof
- Hardware-based validation
- Remote attestation signatures
- Zero-knowledge proofs (zkML)

### 3.4 Integration with A2A and x402

```
┌──────────────────────────────────────────────────────────┐
│                    ERC-8004 Layer                         │
│  (Discovery, Reputation, Validation)                      │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐     │
│  │  Identity   │  │  Reputation  │  │ Validation  │     │
│  │  Registry   │  │   Registry   │  │  Registry   │     │
│  └─────────────┘  └──────────────┘  └─────────────┘     │
└────────────────────┬─────────────────────────────────────┘
                     │
         ┌───────────┴──────────────┐
         │                          │
┌────────▼─────────┐       ┌────────▼─────────┐
│   A2A Protocol   │       │   x402 Protocol  │
│  (Communication) │◄─────►│   (Payments)     │
└──────────────────┘       └──────────────────┘
```

**Discovery Flow:**
```typescript
// 1. Discover agents via ERC-8004 Identity Registry
const identityRegistry = new ethers.Contract(
  IDENTITY_REGISTRY_ADDRESS,
  identityRegistryABI,
  provider
);

const agentId = 42;
const tokenURI = await identityRegistry.tokenURI(agentId);
const registrationFile = await fetch(tokenURI).then(r => r.json());

// 2. Check reputation
const reputationRegistry = new ethers.Contract(
  REPUTATION_REGISTRY_ADDRESS,
  reputationRegistryABI,
  provider
);

const { count, averageScore } = await reputationRegistry.getSummary(
  agentId,
  [], // No filter
  ethers.utils.formatBytes32String("gameplay"),
  ethers.ZeroHash
);

console.log(`Agent has ${count} reviews with average score ${averageScore}/100`);

// 3. Connect via A2A
const a2aEndpoint = registrationFile.endpoints.find(e => e.name === "A2A");
const agentClient = new A2AClient({
  agentCardUrl: a2aEndpoint.endpoint,
  authentication: { /* ... */ }
});

// 4. Send message (with x402 payment)
const response = await agentClient.sendMessage({
  role: "user",
  parts: [{ type: "text", text: "Make your move" }]
}, {
  payment: {
    x402: true,
    maxAmount: "10000" // $0.01
  }
});

// 5. Submit feedback to reputation registry
const feedbackAuth = await getPreSignedFeedbackAuth(agentId);
await reputationRegistry.giveFeedback(
  agentId,
  95, // Score
  ethers.utils.formatBytes32String("gameplay"),
  ethers.utils.formatBytes32String("strategy"),
  "ipfs://QmFeedbackFile",
  ethers.ZeroHash,
  feedbackAuth
);
```

### 3.5 Game Integration Example

```typescript
// Register game AI agent on-chain
const identityRegistry = new ethers.Contract(
  IDENTITY_REGISTRY_ADDRESS,
  identityRegistryABI,
  signer
);

// Upload registration file to IPFS
const registrationFile = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "Babylon AI Player",
  description: "Advanced strategy AI for Babylon game",
  image: "https://babylon.game/ai-avatar.png",
  endpoints: [
    {
      name: "A2A",
      endpoint: "https://babylon.game/ai/.well-known/agent-card.json",
      version: "0.3.0"
    },
    {
      name: "agentWallet",
      endpoint: `eip155:8453:${aiAgentWalletAddress}`
    }
  ],
  registrations: [],
  supportedTrust: ["reputation", "crypto-economic"]
};

const ipfsHash = await uploadToIPFS(registrationFile);
const tokenURI = `ipfs://${ipfsHash}`;

// Register agent
const tx = await identityRegistry.register(tokenURI, [
  {
    key: "agentWallet",
    value: ethers.utils.defaultAbiCoder.encode(
      ["address"],
      [aiAgentWalletAddress]
    )
  }
]);

const receipt = await tx.wait();
const agentId = receipt.events.find(e => e.event === "Registered").args.agentId;

console.log(`Registered agent with ID: ${agentId}`);
console.log(`Global identifier: eip155:8453:${IDENTITY_REGISTRY_ADDRESS}:${agentId}`);
```

---

## 4. WebSocket Integration for Real-Time Communication

### 4.1 WebSocket vs HTTP for Agent Communication

**Use HTTP (A2A Protocol):**
- Request-response patterns
- Stateless operations
- Cross-organizational communication
- Standard REST/JSON-RPC APIs

**Use WebSocket:**
- Real-time game state updates
- Live player/agent position tracking
- Continuous event streams
- Low-latency bidirectional communication
- Connection pooling for multiple agents

### 4.2 WebSocket Security (2025 Best Practices)

#### Authentication During Handshake

```typescript
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const wss = new WebSocketServer({
  noServer: true,
  verifyClient: async (info, callback) => {
    try {
      // Extract token from query params or subprotocol
      const token = new URL(info.req.url, 'ws://localhost').searchParams.get('token');

      if (!token) {
        callback(false, 401, 'Unauthorized: Missing token');
        return;
      }

      // Verify JWT
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user/agent info to request
      info.req.userId = payload.userId;
      info.req.agentId = payload.agentId;

      // Validate origin
      const origin = info.origin || info.req.headers.origin;
      const allowedOrigins = ['https://babylon.game', 'https://ai.babylon.game'];

      if (!allowedOrigins.includes(origin)) {
        callback(false, 403, 'Forbidden: Invalid origin');
        return;
      }

      callback(true);
    } catch (err) {
      callback(false, 401, 'Unauthorized: Invalid token');
    }
  }
});

// Upgrade HTTP server to WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.userId = request.userId;
    ws.agentId = request.agentId;
    wss.emit('connection', ws, request);
  });
});
```

#### Client Connection

```typescript
// Connect with JWT token
const token = await getAuthToken(); // From OAuth2, API key, etc.
const ws = new WebSocket(`wss://babylon.game/game?token=${token}`);

ws.on('open', () => {
  console.log('Connected to game server');

  // Send initial message
  ws.send(JSON.stringify({
    type: 'JOIN_GAME',
    gameId: 'game-123',
    playerId: 'player-456'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  handleGameEvent(message);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} ${reason}`);
  // Implement reconnection logic
});
```

### 4.3 Game Server WebSocket Architecture

```typescript
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { A2AServer } from '@a2aproject/server';
import { X402Server } from '@x402/server';

// HTTP server for A2A and x402
const httpServer = createServer();

// A2A agent interface
const a2aServer = new A2AServer({
  name: "Babylon Game Server",
  authentication: { /* ... */ },
  skills: [ /* ... */ ]
});

// x402 payment middleware
const x402Server = new X402Server({
  walletAddress: process.env.TREASURY_ADDRESS,
  pricing: {
    "/api/game/move": "$0.001"
  }
});

httpServer.on('request', (req, res) => {
  // Handle A2A requests
  if (req.url.startsWith('/a2a')) {
    a2aServer.handle(req, res);
  }
  // Handle x402 payment endpoints
  else if (req.url.startsWith('/api')) {
    x402Server.handle(req, res);
  }
});

// WebSocket server for real-time game state
const wss = new WebSocketServer({ noServer: true });

// Game state manager
class GameStateManager {
  private games: Map<string, GameState> = new Map();
  private connections: Map<string, Set<WebSocket>> = new Map();

  joinGame(gameId: string, ws: WebSocket, playerId: string) {
    if (!this.connections.has(gameId)) {
      this.connections.set(gameId, new Set());
    }
    this.connections.get(gameId).add(ws);

    // Send current game state
    const gameState = this.games.get(gameId);
    ws.send(JSON.stringify({
      type: 'GAME_STATE',
      state: gameState
    }));
  }

  broadcastMove(gameId: string, move: Move) {
    const connections = this.connections.get(gameId);
    if (!connections) return;

    const message = JSON.stringify({
      type: 'MOVE',
      move: move
    });

    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  leaveGame(gameId: string, ws: WebSocket) {
    const connections = this.connections.get(gameId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.connections.delete(gameId);
      }
    }
  }
}

const gameManager = new GameStateManager();

wss.on('connection', (ws: WebSocket, request) => {
  const playerId = (request as any).userId;
  const agentId = (request as any).agentId;
  let currentGameId: string | null = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'JOIN_GAME':
          currentGameId = message.gameId;
          gameManager.joinGame(currentGameId, ws, playerId);
          break;

        case 'MAKE_MOVE':
          if (!currentGameId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Not in a game' }));
            return;
          }

          // Validate and process move
          const move = await processMove(currentGameId, playerId, message.move);

          // Broadcast to all players
          gameManager.broadcastMove(currentGameId, move);
          break;

        case 'LEAVE_GAME':
          if (currentGameId) {
            gameManager.leaveGame(currentGameId, ws);
            currentGameId = null;
          }
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (currentGameId) {
      gameManager.leaveGame(currentGameId, ws);
    }
  });
});

// Upgrade connections
httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

httpServer.listen(3000);
```

### 4.4 Agent WebSocket Client

```typescript
class GameAgent {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async connect(gameId: string) {
    const token = await this.getAuthToken();
    this.ws = new WebSocket(`wss://babylon.game/game?token=${token}`);

    this.ws.on('open', () => {
      console.log('Agent connected to game');
      this.reconnectAttempts = 0;

      // Join game
      this.send({
        type: 'JOIN_GAME',
        gameId: gameId
      });
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    });

    this.ws.on('close', () => {
      console.log('Connection closed');
      this.reconnect(gameId);
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private async reconnect(gameId: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(gameId);
    }, delay);
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'GAME_STATE':
        this.onGameState(message.state);
        break;

      case 'MOVE':
        this.onMove(message.move);
        break;

      case 'ERROR':
        console.error('Server error:', message.message);
        break;
    }
  }

  private async onGameState(state: GameState) {
    // Analyze game state and decide on action
    const decision = await this.analyzeState(state);

    if (decision.shouldMove) {
      this.makeMove(decision.move);
    }
  }

  private async onMove(move: Move) {
    // React to opponent's move
    console.log('Opponent moved:', move);
  }

  makeMove(move: Move) {
    this.send({
      type: 'MAKE_MOVE',
      move: move
    });
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private async getAuthToken(): Promise<string> {
    // Obtain JWT from auth service
    return process.env.AGENT_TOKEN;
  }

  disconnect() {
    if (this.ws) {
      this.send({ type: 'LEAVE_GAME' });
      this.ws.close();
    }
  }
}

// Usage
const agent = new GameAgent();
await agent.connect('game-123');
```

---

## 5. Recommended Architecture for Babylon Game

### 5.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Web Client  │  │  Mobile App  │  │ Admin Panel  │         │
│  │  (React)     │  │  (React)     │  │  (React)     │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Load Balancer + TLS Termination                           │ │
│  │  - Rate Limiting                                            │ │
│  │  - Authentication (JWT, OAuth2)                            │ │
│  │  - Protocol Routing (HTTP, WebSocket, A2A)                │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────┐
│   HTTP/REST     │  │  WebSocket   │  │  A2A Server  │
│   Server        │  │  Server      │  │  (Agent API) │
│                 │  │              │  │              │
│  - Game API     │  │  - Real-time │  │  - Agent     │
│  - User mgmt    │  │    state     │  │    discovery │
│  - x402 payment │  │  - Live moves│  │  - Agent     │
│                 │  │  - Events    │  │    messaging │
└────────┬────────┘  └──────┬───────┘  └──────┬───────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Business Logic Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Game Engine │  │  AI Engine   │  │  Payment     │         │
│  │              │  │              │  │  Service     │         │
│  │  - Rules     │  │  - Decision  │  │              │         │
│  │  - State mgmt│  │    making    │  │  - x402      │         │
│  │  - Validation│  │  - Strategy  │  │    verify    │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  PostgreSQL  │  │  Redis Cache │  │  IPFS/S3     │         │
│  │              │  │              │  │              │         │
│  │  - Game data │  │  - Sessions  │  │  - Agent     │         │
│  │  - Users     │  │  - Real-time │  │    metadata  │         │
│  │  - Moves     │  │    state     │  │  - Feedback  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Blockchain Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Base L2     │  │  ERC-8004    │  │  x402        │         │
│  │              │  │  Registries  │  │  Facilitator │         │
│  │  - Payments  │  │              │  │              │         │
│  │  - Agent IDs │  │  - Identity  │  │  - Verify    │         │
│  │              │  │  - Reputation│  │  - Settle    │         │
│  │              │  │  - Validation│  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Protocol Usage Patterns

**For Human Players:**
```
1. Authentication: OAuth2 / JWT
2. Connection: WebSocket for real-time gameplay
3. API: REST/HTTP for game setup, history, profiles
4. Payments: x402 for premium features (optional)
```

**For AI Agents:**
```
1. Discovery: ERC-8004 Identity Registry
2. Trust: ERC-8004 Reputation Registry
3. Communication: A2A Protocol (JSON-RPC over HTTPS)
4. Real-time: WebSocket for live game participation
5. Payments: x402 for API usage, agent services
6. Feedback: Submit reputation after games
```

### 5.3 Data Flow Examples

#### Agent Makes a Move

```
┌─────────┐
│AI Agent │
└────┬────┘
     │ 1. Discover game server
     ├──────────────────────────┐
     │                          │
     │ ERC-8004 Identity        │
     │ → Get agent card URL     │
     │                          │
     ◄──────────────────────────┘
     │
     │ 2. Connect via A2A
     ├──────────────────────────┐
     │                          │
     │ A2A message/send         │
     │ {                        │
     │   message: "Join game",  │
     │   gameId: "game-123"     │
     │ }                        │
     │                          │
     ◄──────────────────────────┘
     │ taskId: "task-456"
     │
     │ 3. Connect WebSocket
     ├──────────────────────────┐
     │                          │
     │ WSS + JWT auth           │
     │ JOIN_GAME message        │
     │                          │
     ◄──────────────────────────┘
     │ GAME_STATE
     │
     │ 4. Make move
     ├──────────────────────────┐
     │                          │
     │ MAKE_MOVE + x402 payment │
     │ {                        │
     │   position: [3, 5],      │
     │   X-PAYMENT: "..."       │
     │ }                        │
     │                          │
     ◄──────────────────────────┘
     │ MOVE broadcast
     │
     │ 5. Receive feedback auth
     ├──────────────────────────┐
     │                          │
     │ Signed FeedbackAuth      │
     │                          │
     ◄──────────────────────────┘
     │
     │ 6. Submit reputation
     ├──────────────────────────┐
     │                          │
     │ ERC-8004 Reputation      │
     │ giveFeedback()           │
     │ Score: 95                │
     │                          │
     └──────────────────────────┘
```

#### Human Gives Feedback on AI Agent

```
┌───────────┐
│Human      │
│Player     │
└─────┬─────┘
      │ 1. Complete game
      │
      │ 2. Request feedback auth
      ├─────────────────────────┐
      │                         │
      │ POST /api/feedback/auth │
      │ { agentId: 42 }         │
      │                         │
      ◄─────────────────────────┘
      │ { feedbackAuth: "0x..." }
      │
      │ 3. Upload feedback to IPFS
      ├─────────────────────────┐
      │                         │
      │ {                       │
      │   agentId: 42,          │
      │   score: 95,            │
      │   comments: "...",      │
      │   proof_of_payment: {...}│
      │ }                       │
      │                         │
      ◄─────────────────────────┘
      │ ipfs://Qm...
      │
      │ 4. Submit on-chain
      ├─────────────────────────┐
      │                         │
      │ reputationRegistry      │
      │   .giveFeedback(        │
      │     agentId: 42,        │
      │     score: 95,          │
      │     fileUri: "ipfs://", │
      │     feedbackAuth        │
      │   )                     │
      │                         │
      ◄─────────────────────────┘
      │ NewFeedback event
      │
      │ 5. Update UI
      └─────────────────────────┘
```

### 5.4 Implementation Roadmap

**Phase 1: Core Infrastructure (Weeks 1-4)**
- [ ] Set up Base testnet (Sepolia) infrastructure
- [ ] Deploy HTTP server with REST API
- [ ] Implement WebSocket server with authentication
- [ ] Basic game logic and state management
- [ ] PostgreSQL schema and Redis caching

**Phase 2: A2A Integration (Weeks 5-8)**
- [ ] Implement A2A server with Agent Card
- [ ] Support JSON-RPC 2.0 over HTTPS
- [ ] Task lifecycle management
- [ ] Message/artifact handling
- [ ] Integration tests with A2A clients

**Phase 3: x402 Payments (Weeks 9-12)**
- [ ] Integrate x402 middleware
- [ ] Configure Coinbase facilitator
- [ ] Implement payment verification flow
- [ ] Add payment receipts and logging
- [ ] Test with USDC on Base testnet

**Phase 4: ERC-8004 Trust Layer (Weeks 13-16)**
- [ ] Deploy or connect to ERC-8004 registries
- [ ] Register game server as agent
- [ ] Implement feedback authorization flow
- [ ] Build reputation display UI
- [ ] Validation integration (optional)

**Phase 5: Production & Monitoring (Weeks 17-20)**
- [ ] Security audit
- [ ] Load testing and optimization
- [ ] Deploy to mainnet (Base L2)
- [ ] Set up monitoring and alerts
- [ ] Documentation and API reference

### 5.5 Technology Stack Recommendations

**Backend:**
```
- Runtime: Node.js v20+ with TypeScript
- Framework: Express.js or Fastify
- WebSocket: ws or socket.io
- Database: PostgreSQL 16+
- Cache: Redis 7+
- Blockchain: ethers.js v6 or viem
```

**Frontend:**
```
- Framework: React 18+ with TypeScript
- State: Zustand or Redux Toolkit
- Blockchain: wagmi + viem
- WebSocket: native WebSocket API
- UI: Tailwind CSS + shadcn/ui
```

**Protocols:**
```
- A2A: @a2aproject/server, @a2aproject/client
- x402: @x402/server, @x402/client
- ERC-8004: Custom contracts or reference implementation
```

**Infrastructure:**
```
- Hosting: AWS/GCP/Vercel
- CDN: Cloudflare
- IPFS: Pinata or Web3.Storage
- Blockchain RPC: Base (Coinbase, QuickNode)
- Monitoring: DataDog, Sentry
```

---

## 6. Security Best Practices

### 6.1 Authentication & Authorization

**JWT Best Practices:**
```typescript
import jwt from 'jsonwebtoken';

// Short-lived access tokens (15 min)
const accessToken = jwt.sign(
  {
    userId: user.id,
    agentId: agent?.id,
    roles: user.roles
  },
  process.env.JWT_SECRET,
  {
    expiresIn: '15m',
    issuer: 'babylon-game',
    audience: 'babylon-api'
  }
);

// Long-lived refresh tokens (7 days)
const refreshToken = jwt.sign(
  { userId: user.id },
  process.env.REFRESH_SECRET,
  { expiresIn: '7d' }
);

// Verify and validate
const validateToken = (token: string) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'babylon-game',
      audience: 'babylon-api'
    });
    return payload;
  } catch (err) {
    throw new UnauthorizedError('Invalid token');
  }
};
```

**OAuth 2.0 for A2A:**
```typescript
// Client credentials flow for machine-to-machine
const getA2AAccessToken = async () => {
  const response = await fetch('https://auth.babylon.game/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: 'a2a:read a2a:write'
    })
  });

  const { access_token } = await response.json();
  return access_token;
};
```

### 6.2 Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user/agent ID
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Stricter limits for expensive operations
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip
});

app.use('/api', apiLimiter);
app.use('/api/game/ai-assist', strictLimiter);
```

### 6.3 Input Validation

```typescript
import { z } from 'zod';

// Schema validation
const MoveSchema = z.object({
  gameId: z.string().uuid(),
  playerId: z.string().uuid(),
  position: z.tuple([
    z.number().int().min(0).max(19),
    z.number().int().min(0).max(19)
  ]),
  timestamp: z.number().int().positive()
});

// Validate request
app.post('/api/game/move', async (req, res) => {
  try {
    const move = MoveSchema.parse(req.body);
    // Process validated move
  } catch (err) {
    res.status(400).json({
      error: 'Invalid move data',
      details: err.errors
    });
  }
});
```

### 6.4 CORS Configuration

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://babylon.game',
      'https://app.babylon.game',
      'https://ai.babylon.game'
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-PAYMENT'],
  exposedHeaders: ['X-PAYMENT-RESPONSE']
};

app.use(cors(corsOptions));
```

### 6.5 Blockchain Security

```typescript
// Verify signatures
import { verifyMessage } from 'ethers';

const verifyFeedbackAuth = (
  feedbackAuth: FeedbackAuth,
  signature: string
): boolean => {
  const message = ethers.utils.solidityKeccak256(
    ['uint256', 'address', 'uint64', 'uint256', 'uint256', 'address'],
    [
      feedbackAuth.agentId,
      feedbackAuth.clientAddress,
      feedbackAuth.indexLimit,
      feedbackAuth.expiry,
      feedbackAuth.chainId,
      feedbackAuth.identityRegistry
    ]
  );

  const recoveredAddress = verifyMessage(
    ethers.utils.arrayify(message),
    signature
  );

  return recoveredAddress.toLowerCase() ===
         feedbackAuth.signerAddress.toLowerCase();
};

// Validate blockchain data
const validatePayment = async (
  txHash: string,
  expectedAmount: string,
  expectedRecipient: string
): Promise<boolean> => {
  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);

  // Verify transaction success
  if (receipt.status !== 1) return false;

  // Verify amount and recipient
  // (Implementation depends on token contract)

  return true;
};
```

---

## 7. Monitoring & Observability

### 7.1 Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'babylon-game' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Log A2A requests
logger.info('A2A request received', {
  method: 'message/send',
  agentId: 42,
  taskId: 'task-789',
  timestamp: Date.now()
});

// Log x402 payments
logger.info('Payment processed', {
  txHash: '0x...',
  amount: '10000',
  from: '0x...',
  to: '0x...',
  status: 'success'
});
```

### 7.2 Metrics

```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Request counter
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// Response time histogram
const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Active WebSocket connections
const wsConnections = new Gauge({
  name: 'websocket_connections_active',
  help: 'Active WebSocket connections'
});

// x402 payments
const paymentsProcessed = new Counter({
  name: 'payments_processed_total',
  help: 'Total payments processed',
  labelNames: ['status', 'network']
});

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequests.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
    httpDuration.observe({
      method: req.method,
      route: req.route?.path || req.path
    }, duration);
  });

  next();
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { X402Client } from '@x402/client';

describe('x402 Payment Flow', () => {
  it('should create valid payment payload', async () => {
    const client = new X402Client({
      privateKey: TEST_PRIVATE_KEY,
      network: 'base-sepolia'
    });

    const payload = await client.createPaymentPayload({
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '10000',
      recipient: '0xRecipient'
    });

    expect(payload.x402Version).toBe(1);
    expect(payload.scheme).toBe('exact');
    expect(payload.payload.value).toBe('10000');
  });
});
```

### 8.2 Integration Tests

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { A2AClient } from '@a2aproject/client';

describe('A2A Integration', () => {
  let client: A2AClient;

  beforeAll(async () => {
    client = new A2AClient({
      agentCardUrl: 'http://localhost:3000/.well-known/agent-card.json',
      authentication: {
        type: 'Bearer',
        token: TEST_TOKEN
      }
    });
  });

  it('should send message and receive response', async () => {
    const response = await client.sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: 'Test message' }]
    });

    expect(response.taskId).toBeDefined();
    expect(response.status).toBe('WORKING');
  });

  it('should stream response chunks', async () => {
    const chunks: string[] = [];

    await client.streamMessage(
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Generate story' }]
      },
      (chunk) => {
        chunks.push(chunk);
      }
    );

    expect(chunks.length).toBeGreaterThan(0);
  });
});
```

### 8.3 E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('AI agent completes game', async ({ page }) => {
  // Navigate to game
  await page.goto('https://babylon.game');

  // Connect agent wallet
  await page.click('[data-testid="connect-agent"]');
  await page.fill('[data-testid="agent-address"]', TEST_AGENT_ADDRESS);

  // Join game
  await page.click('[data-testid="join-game"]');
  await expect(page.locator('[data-testid="game-state"]')).toBeVisible();

  // Wait for agent to make move
  await page.waitForSelector('[data-testid="move-made"]', {
    timeout: 10000
  });

  // Verify move was successful
  const moveNotification = page.locator('[data-testid="move-notification"]');
  await expect(moveNotification).toContainText('Agent moved');

  // Verify payment processed
  const paymentStatus = page.locator('[data-testid="payment-status"]');
  await expect(paymentStatus).toContainText('Payment confirmed');
});
```

---

## 9. Key Takeaways & Next Steps

### 9.1 Summary

**x402 Protocol:**
- HTTP-native micropayments enabling instant agent transactions
- Single line of code integration for servers
- Zero fees via Coinbase facilitator on Base
- Perfect for pay-per-use AI agent services

**A2A Protocol:**
- Standard for agent interoperability across platforms
- JSON-RPC 2.0 over HTTPS with streaming support
- Comprehensive task lifecycle management
- Enterprise-ready authentication and security

**ERC-8004:**
- Blockchain-based agent discovery and trust
- Three registries: Identity, Reputation, Validation
- Portable agent identifiers across chains
- Pluggable trust models (reputation, staking, TEE)

**Integration:**
- Protocols are complementary, not competing
- ERC-8004 handles discovery and trust
- A2A enables communication
- x402 processes payments
- WebSocket for real-time gameplay

### 9.2 Recommended Next Steps

**Immediate (Week 1):**
1. Set up Base testnet infrastructure
2. Deploy basic HTTP + WebSocket server
3. Implement authentication (JWT + OAuth2)
4. Create initial game logic

**Short-term (Weeks 2-8):**
1. Integrate A2A Protocol server
2. Add x402 payment middleware
3. Test with AI agent clients
4. Implement reputation feedback flow

**Medium-term (Weeks 9-16):**
1. Deploy/connect to ERC-8004 registries
2. Register game server as agent
3. Build agent marketplace UI
4. Security audit and testing

**Long-term (Weeks 17+):**
1. Production deployment to Base mainnet
2. Monitoring and analytics setup
3. Agent developer documentation
4. Community building and adoption

### 9.3 Resources

**Documentation:**
- x402: https://docs.cdp.coinbase.com/x402/welcome
- A2A: https://a2a-protocol.org/latest/specification/
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004

**Code Repositories:**
- x402: https://github.com/coinbase/x402
- A2A: https://github.com/a2aproject/A2A
- ERC-8004 Example: https://github.com/vistara-apps/erc-8004-example

**Community:**
- x402 Discord: https://discord.gg/invite/cdp
- A2A GitHub Discussions: https://github.com/a2aproject/A2A/discussions
- Base Developer Forum: https://base.org/developers

---

**Report compiled on:** October 29, 2025
**Last updated:** October 29, 2025
**Version:** 1.0
