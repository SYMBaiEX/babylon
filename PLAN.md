# Babylon Prediction Market Game - Master Implementation Plan

**Version**: 2.0
**Date**: October 29, 2025
**Status**: Research Complete → Implementation Phase
**Project Completion**: 70% (Core Systems Operational)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Phase 1: Blockchain Foundation (4-6 weeks)](#phase-1-blockchain-foundation)
5. [Phase 2: A2A Protocol Integration (3-4 weeks)](#phase-2-a2a-protocol-integration)
6. [Phase 3: AI Agent System (4-5 weeks)](#phase-3-ai-agent-system)
7. [Phase 4: Production Readiness (3-4 weeks)](#phase-4-production-readiness)
8. [Security & Auditing](#security--auditing)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Plan](#deployment-plan)
11. [Success Metrics](#success-metrics)
12. [Risk Mitigation](#risk-mitigation)

---

## Executive Summary

### Project Vision

Babylon is a **next-generation prediction market game** combining:
- **Polymarket-style binary outcome markets** with CLOB architecture
- **Perpetual futures trading** with leverage and funding rates
- **Satirical social media simulation** with 185 AI-driven NPCs
- **Blockchain settlement** via EVM-compatible L2
- **Autonomous AI agents** as market participants (humans + bots)
- **Decentralized identity** via ERC-8004 standard
- **Agent-to-agent communication** via A2A protocol

### Current Status

**✅ Complete (70%)**:
- Realtime game engine with continuous generation
- Perpetual futures trading system
- Prediction market mechanics (LMSR pricing)
- Social media feed with 185 actors
- Database layer (23 Prisma models)
- Frontend UI (React 19 + Next.js 16)
- Wallet authentication (Privy)

**🚧 In Progress (20%)**:
- Smart contract development
- Testing infrastructure
- Production deployment setup

**❌ Not Started (10%)**:
- Blockchain integration
- ERC-8004 identity registry
- A2A protocol implementation
- Autonomous AI agent framework
- On-chain settlement

### Research Completed

Six parallel research agents completed comprehensive investigations:

1. **Polymarket Architecture** → Hybrid CLOB + CTF tokens + UMA oracle
2. **ERC-8004 Standard** → Identity/Reputation/Validation registries
3. **x402/A2A Protocols** → Agent communication + micropayments
4. **EVM Blockchain** → Base L2 + Diamond Standard + security
5. **AI Agent Systems** → ElizaOS + EVM plugin + multi-agent coordination
6. **Codebase Analysis** → Complete mapping + integration points

### Timeline

**Total Duration**: 14-19 weeks (3.5-4.5 months)

| Phase | Duration | Completion Target |
|-------|----------|-------------------|
| Phase 1: Blockchain | 4-6 weeks | Week 6 |
| Phase 2: A2A Protocol | 3-4 weeks | Week 10 |
| Phase 3: AI Agents | 4-5 weeks | Week 15 |
| Phase 4: Production | 3-4 weeks | Week 19 |

**Launch Target**: Q1 2026

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Feed    │  │ Markets  │  │  Chats   │  │ Profile  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│         │              │              │              │       │
│         └──────────────┴──────────────┴──────────────┘       │
│                           │                                   │
│                    ┌──────▼──────┐                           │
│                    │  API Layer  │                           │
│                    │  (30 routes)│                           │
│                    └──────┬──────┘                           │
└───────────────────────────┼─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼────┐      ┌──────▼──────┐   ┌─────▼─────┐
    │ Postgres│      │Game Engines │   │  Privy    │
    │  (23    │      │   (4 core)  │   │   Auth    │
    │ models) │      └──────┬──────┘   └───────────┘
    └─────────┘             │
                            │
         ┌──────────────────┴──────────────────┐
         │                                      │
    ┌────▼─────────┐                    ┌──────▼──────┐
    │  Blockchain  │                    │    A2A      │
    │   Layer      │◄──────────────────►│  Protocol   │
    │              │                    │             │
    │ - Contracts  │                    │ - Identity  │
    │ - Oracles    │                    │ - Messaging │
    │ - Settlement │                    │ - Discovery │
    └──────┬───────┘                    └──────┬──────┘
           │                                   │
           │         ┌─────────────────────────┘
           │         │
      ┌────▼─────────▼────┐
      │   AI Agent Layer  │
      │                   │
      │  - ElizaOS        │
      │  - EVM Plugin     │
      │  - Memory Systems │
      │  - Actions/Evals  │
      └───────────────────┘
```

### Data Flow

**Game Loop (Realtime)**:
```
RealtimeGameEngine (60s tick)
  └─► PriceEngine → Company prices (32 stocks)
  └─► PerpetualsEngine → Funding, liquidations
  └─► QuestionManager → Create/resolve predictions
  └─► FeedGenerator → Actor posts (10-20/min)
  └─► Database → Persist state
  └─► WebSocket → Broadcast updates
```

**Trading Flow (Hybrid)**:
```
User Action (UI)
  └─► API Endpoint
       └─► Validate (auth, balance, limits)
       └─► Database Update (optimistic)
       └─► Blockchain Settlement (periodic)
       └─► Event Emission
       └─► Update Positions
```

**Agent Flow (Autonomous)**:
```
AI Agent (ElizaOS)
  └─► A2A Handshake → Authenticate via ERC-8004
  └─► Subscribe to Feed → WebSocket stream
  └─► Analyze Information → ElizaOS Runtime + Memory
  └─► Make Decision → Kelly Criterion + Strategy (Actions)
  └─► Execute Trade → EVM Plugin → Smart Contract
  └─► Update Reputation → On-chain feedback (Evaluators)
```

---

## Technology Stack

### Existing Stack (Production-Ready)

**Frontend**:
- Next.js 16 (App Router)
- React 19
- TypeScript 5.9 (strict mode)
- TailwindCSS 4.0
- Zustand (state management)
- TanStack React Query (server state)

**Backend**:
- Bun runtime
- PostgreSQL
- Prisma 6.18.0 (ORM)
- 30 API routes

**Authentication**:
- Privy 3.0.1 (wallet auth)
- Wagmi 2.19.0
- Viem 2.38.4

**AI/LLM**:
- OpenAI 6.6.0
- Groq (fast inference)

### New Technologies (Phase 1-3)

**Blockchain (Phase 1)**:
- Solidity 0.8.27
- Hardhat + Foundry (dual testing)
- OpenZeppelin Contracts 5.1
- Chainlink Oracles
- UMA MOOV2 Oracle
- Base L2 (recommended)

**Smart Contract Patterns**:
- Diamond Standard (EIP-2535) for upgradeability
- Conditional Token Framework (Gnosis)
- LMSR market maker
- ReentrancyGuard + CEI pattern

**A2A Protocol (Phase 2)**:
- WebSocket (ws library)
- JSON-RPC 2.0
- x402 micropayments
- ERC-8004 identity registry

**AI Agents (Phase 3)**:
- ElizaOS (TypeScript agent framework)
- @elizaos/plugin-evm (blockchain integration)
- Built-in memory system (episodic + semantic)
- Multi-agent coordination (native)

**Testing & Monitoring**:
- Foundry (unit tests - 15x faster)
- Hardhat (integration tests)
- Synpress (E2E wallet tests)
- Sentry (error tracking)
- Grafana + Prometheus (metrics)

---

## Phase 1: Blockchain Foundation (4-6 weeks)

### Objectives

- Deploy production-ready smart contracts
- Integrate on-chain settlement
- Implement oracle systems
- Enable real token deposits/withdrawals

### Week 1-2: Smart Contract Development

#### Task 1.1: Core Contract Architecture

**Deliverables**:
```
contracts/
├── core/
│   ├── BabylonHub.sol              # Diamond proxy hub
│   ├── facets/
│   │   ├── PredictionMarketFacet.sol
│   │   ├── PerpetualsFacet.sol
│   │   ├── IdentityFacet.sol
│   │   └── ReputationFacet.sol
│   └── libraries/
│       ├── LibMarket.sol
│       └── LibPerpetuals.sol
├── tokens/
│   ├── BabylonToken.sol            # ERC-20 game token
│   └── ConditionalTokens.sol       # CTF implementation
├── oracles/
│   ├── ChainlinkAdapter.sol        # Automated resolution
│   └── UMAAdapter.sol              # Manual disputes
└── identity/
    ├── IdentityRegistry.sol        # ERC-8004
    ├── ReputationRegistry.sol
    └── ValidationRegistry.sol
```

**Implementation Pattern** (Diamond Standard):
```solidity
// contracts/core/BabylonHub.sol
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./libraries/LibDiamond.sol";

contract BabylonHub {
    struct DiamondStorage {
        mapping(bytes4 => address) facets;
        mapping(address => uint256) balances;
        mapping(bytes32 => Market) markets;
        mapping(bytes32 => Position) positions;
    }

    // Diamond cut for upgrades
    function diamondCut(
        FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata _calldata
    ) external onlyOwner {
        LibDiamond.diamondCut(_diamondCut, _init, _calldata);
    }
}
```

**Prediction Market Facet** (LMSR Implementation):
```solidity
// contracts/core/facets/PredictionMarketFacet.sol
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../libraries/LibMarket.sol";

contract PredictionMarketFacet is ReentrancyGuard {
    using LibMarket for LibMarket.Market;

    // LMSR pricing (from Polymarket research)
    function calculateCost(
        bytes32 marketId,
        uint8 outcome,
        uint256 numShares
    ) public view returns (uint256) {
        LibMarket.Market storage market = LibMarket.getMarket(marketId);

        // LMSR cost function: b * ln(sum(e^(q_i / b)))
        uint256 b = market.liquidity; // Liquidity parameter
        uint256 cost = 0;

        for (uint8 i = 0; i < market.numOutcomes; i++) {
            uint256 shares = market.shares[i];
            if (i == outcome) shares += numShares;

            // Use safe math for exponential
            cost += _exp(shares * 1e18 / b);
        }

        return b * _ln(cost) / 1e18;
    }

    function buyShares(
        bytes32 marketId,
        uint8 outcome,
        uint256 numShares
    ) external nonReentrant {
        require(!market.resolved, "Market resolved");

        uint256 cost = calculateCost(marketId, outcome, numShares);
        require(balances[msg.sender] >= cost, "Insufficient balance");

        // Update state (CEI pattern)
        balances[msg.sender] -= cost;
        market.shares[outcome] += numShares;
        positions[msg.sender][marketId].shares[outcome] += numShares;

        emit SharesPurchased(marketId, msg.sender, outcome, numShares, cost);
    }

    function resolveMarket(
        bytes32 marketId,
        uint8 winningOutcome
    ) external onlyOracle {
        LibMarket.Market storage market = LibMarket.getMarket(marketId);
        require(!market.resolved, "Already resolved");

        market.resolved = true;
        market.winningOutcome = winningOutcome;

        emit MarketResolved(marketId, winningOutcome);
    }
}
```

**Perpetuals Facet**:
```solidity
// contracts/core/facets/PerpetualsFacet.sol
pragma solidity ^0.8.27;

contract PerpetualsFacet is ReentrancyGuard {
    struct Position {
        bool isLong;
        uint256 size;
        uint256 entryPrice;
        uint256 leverage;
        uint256 margin;
        uint256 lastFundingTime;
    }

    function openPosition(
        bytes32 symbol,
        bool isLong,
        uint256 size,
        uint256 leverage
    ) external nonReentrant {
        require(leverage >= 1 && leverage <= 100, "Invalid leverage");

        uint256 margin = size / leverage;
        require(balances[msg.sender] >= margin, "Insufficient margin");

        uint256 currentPrice = oracle.getPrice(symbol);

        // Check liquidation price
        uint256 liqPrice = isLong
            ? currentPrice * (leverage - 1) / leverage
            : currentPrice * (leverage + 1) / leverage;

        Position memory position = Position({
            isLong: isLong,
            size: size,
            entryPrice: currentPrice,
            leverage: leverage,
            margin: margin,
            lastFundingTime: block.timestamp
        });

        positions[msg.sender][symbol] = position;
        balances[msg.sender] -= margin;

        emit PositionOpened(msg.sender, symbol, isLong, size, leverage);
    }

    function checkLiquidation(address trader, bytes32 symbol) public {
        Position storage position = positions[trader][symbol];
        if (position.size == 0) return;

        uint256 currentPrice = oracle.getPrice(symbol);
        uint256 liqPrice = position.isLong
            ? position.entryPrice * (position.leverage - 1) / position.leverage
            : position.entryPrice * (position.leverage + 1) / position.leverage;

        bool shouldLiquidate = position.isLong
            ? currentPrice <= liqPrice
            : currentPrice >= liqPrice;

        if (shouldLiquidate) {
            _liquidatePosition(trader, symbol);
        }
    }
}
```

**Testing**: Week 1-2 (parallel with development)
```bash
# Foundry unit tests (fast)
forge test --gas-report

# Hardhat integration tests
npx hardhat test

# Coverage target: ≥80%
forge coverage
```

#### Task 1.2: ERC-8004 Identity Registry

**Implementation** (Based on research):
```solidity
// contracts/identity/IdentityRegistry.sol
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract IdentityRegistry is ERC721 {
    struct AgentProfile {
        string name;
        string endpoint;      // A2A endpoint URL
        bytes32 capabilitiesHash;
        uint256 registeredAt;
        bool isActive;
    }

    mapping(uint256 => AgentProfile) public profiles;
    mapping(address => uint256) public addressToTokenId;
    uint256 private _nextTokenId;

    constructor() ERC721("BabylonAgent", "BAGENT") {}

    function registerAgent(
        string calldata name,
        string calldata endpoint,
        bytes32 capabilitiesHash
    ) external returns (uint256) {
        require(addressToTokenId[msg.sender] == 0, "Already registered");

        uint256 tokenId = ++_nextTokenId;
        _mint(msg.sender, tokenId);

        profiles[tokenId] = AgentProfile({
            name: name,
            endpoint: endpoint,
            capabilitiesHash: capabilitiesHash,
            registeredAt: block.timestamp,
            isActive: true
        });

        addressToTokenId[msg.sender] = tokenId;

        emit AgentRegistered(tokenId, msg.sender, name);
        return tokenId;
    }

    function updateEndpoint(uint256 tokenId, string calldata newEndpoint)
        external
    {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        profiles[tokenId].endpoint = newEndpoint;
        emit EndpointUpdated(tokenId, newEndpoint);
    }
}
```

**Reputation Registry**:
```solidity
// contracts/identity/ReputationRegistry.sol
pragma solidity ^0.8.27;

contract ReputationRegistry {
    struct Feedback {
        address from;
        uint8 rating;        // 1-100
        string comment;
        uint256 timestamp;
    }

    mapping(uint256 => Feedback[]) public feedback;
    mapping(uint256 => uint256) public reputationScores;

    function submitFeedback(
        uint256 agentId,
        uint8 rating,
        string calldata comment
    ) external {
        require(rating >= 1 && rating <= 100, "Invalid rating");

        feedback[agentId].push(Feedback({
            from: msg.sender,
            rating: rating,
            comment: comment,
            timestamp: block.timestamp
        }));

        _updateReputationScore(agentId);
    }

    function _updateReputationScore(uint256 agentId) private {
        Feedback[] storage feedbacks = feedback[agentId];
        uint256 totalScore = 0;
        uint256 recentCount = 0;
        uint256 cutoff = block.timestamp - 30 days;

        // Weight recent feedback more heavily
        for (uint i = feedbacks.length; i > 0; i--) {
            if (feedbacks[i-1].timestamp < cutoff) break;
            totalScore += feedbacks[i-1].rating;
            recentCount++;
        }

        if (recentCount > 0) {
            reputationScores[agentId] = totalScore / recentCount;
        }
    }
}
```

**Estimated Time**: 8-10 days

---

### Week 3-4: Oracle Integration & Settlement

#### Task 1.3: Chainlink + UMA Oracle System

**Automated Resolution** (Chainlink):
```solidity
// contracts/oracles/ChainlinkAdapter.sol
pragma solidity ^0.8.27;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";

contract ChainlinkAdapter is ChainlinkClient {
    using Chainlink for Chainlink.Request;

    mapping(bytes32 => bytes32) public requestToMarketId;

    function requestResolution(bytes32 marketId, string memory query)
        external
        onlyAuthorized
    {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfill.selector
        );

        req.add("query", query);
        bytes32 requestId = sendChainlinkRequest(req, fee);
        requestToMarketId[requestId] = marketId;
    }

    function fulfill(bytes32 requestId, uint8 outcome)
        public
        recordChainlinkFulfillment(requestId)
    {
        bytes32 marketId = requestToMarketId[requestId];
        IPredictionMarket(hub).resolveMarket(marketId, outcome);
    }
}
```

**Manual Disputes** (UMA MOOV2):
```solidity
// contracts/oracles/UMAAdapter.sol
pragma solidity ^0.8.27;

import "@uma/core/contracts/optimistic-oracle-v2/interfaces/OptimisticOracleV2Interface.sol";

contract UMAAdapter {
    OptimisticOracleV2Interface public oracle;
    uint256 public constant DISPUTE_WINDOW = 24 hours;

    function proposeResolution(
        bytes32 marketId,
        uint8 outcome
    ) external onlyAuthorized {
        // Propose outcome with bond
        oracle.proposePrice(
            address(this),
            identifier,
            timestamp,
            ancillaryData,
            int256(outcome)
        );

        emit ResolutionProposed(marketId, outcome);
    }

    function settleDispute(bytes32 marketId) external {
        // After dispute window, finalize
        int256 resolvedOutcome = oracle.settle(
            address(this),
            identifier,
            timestamp,
            ancillaryData
        );

        IPredictionMarket(hub).resolveMarket(
            marketId,
            uint8(resolvedOutcome)
        );
    }
}
```

#### Task 1.4: L2 Deployment (Base Mainnet)

**Why Base** (from research):
- 80% L2 market share for transaction fees
- $0.01 per transaction
- Coinbase backing (trusted infrastructure)
- OP Stack technology (Ethereum compatibility)
- AgentKit integration available

**Deployment Configuration**:
```typescript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true  // Better optimization
    }
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC,
      accounts: [process.env.DEPLOYER_KEY],
      chainId: 84532
    },
    base: {
      url: process.env.BASE_MAINNET_RPC,
      accounts: [process.env.DEPLOYER_KEY],
      chainId: 8453,
      gasPrice: 1000000  // 0.001 gwei
    }
  }
}
```

**Deployment Script**:
```typescript
// scripts/deploy.ts
import { ethers } from "hardhat"

async function main() {
  console.log("Deploying to Base...")

  // 1. Deploy Diamond Hub
  const BabylonHub = await ethers.getContractFactory("BabylonHub")
  const hub = await BabylonHub.deploy()
  await hub.deployed()
  console.log("BabylonHub:", hub.address)

  // 2. Deploy Facets
  const PredictionMarketFacet = await ethers.getContractFactory(
    "PredictionMarketFacet"
  )
  const predictionFacet = await PredictionMarketFacet.deploy()
  await predictionFacet.deployed()

  // 3. Diamond Cut (add facets)
  const cut = [
    {
      facetAddress: predictionFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(predictionFacet)
    }
  ]

  await hub.diamondCut(cut, ethers.constants.AddressZero, "0x")

  // 4. Deploy Identity Registry
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry")
  const identity = await IdentityRegistry.deploy()
  await identity.deployed()
  console.log("IdentityRegistry:", identity.address)

  // 5. Deploy Babylon Token
  const BabylonToken = await ethers.getContractFactory("BabylonToken")
  const token = await BabylonToken.deploy()
  await token.deployed()
  console.log("BabylonToken:", token.address)

  // 6. Verify contracts
  await run("verify:verify", {
    address: hub.address,
    constructorArguments: []
  })

  // 7. Save deployment addresses
  const addresses = {
    hub: hub.address,
    identity: identity.address,
    token: token.address,
    network: "base",
    chainId: 8453,
    timestamp: Date.now()
  }

  fs.writeFileSync(
    "deployments/base-mainnet.json",
    JSON.stringify(addresses, null, 2)
  )
}

main().catch(console.error)
```

**Estimated Time**: 8-10 days

---

### Week 5-6: Frontend Integration

#### Task 1.5: Wagmi/Viem Contract Hooks

**Type Generation** (from ABIs):
```bash
# Generate TypeScript types from contracts
npx typechain --target ethers-v6 --out-dir src/contracts/types 'contracts/**/*.json'
```

**Contract Hooks**:
```typescript
// src/contracts/hooks/usePredictionMarket.ts
import { useContractWrite, useContractRead } from 'wagmi'
import { parseUnits } from 'viem'
import PredictionMarketABI from '../abis/PredictionMarketFacet.json'

export function useBuyShares() {
  const { writeAsync, isLoading, error } = useContractWrite({
    address: BABYLON_HUB_ADDRESS,
    abi: PredictionMarketABI,
    functionName: 'buyShares'
  })

  const buyShares = async (
    marketId: string,
    outcome: number,
    numShares: bigint
  ) => {
    try {
      const tx = await writeAsync({
        args: [marketId, outcome, numShares]
      })

      await tx.wait()

      // Optimistic update to database
      await fetch('/api/markets/predictions/buy', {
        method: 'POST',
        body: JSON.stringify({
          marketId,
          outcome,
          shares: numShares.toString(),
          txHash: tx.hash
        })
      })

      return tx
    } catch (err) {
      console.error('Buy shares failed:', err)
      throw err
    }
  }

  return { buyShares, isLoading, error }
}

export function useMarketPrice(marketId: string, outcome: number, shares: bigint) {
  const { data, isLoading } = useContractRead({
    address: BABYLON_HUB_ADDRESS,
    abi: PredictionMarketABI,
    functionName: 'calculateCost',
    args: [marketId, outcome, shares],
    watch: true  // Real-time updates
  })

  return { price: data, isLoading }
}
```

**Transaction Component**:
```typescript
// src/components/markets/BuySharesModal.tsx
import { useBuyShares, useMarketPrice } from '@/contracts/hooks'

export function BuySharesModal({ market }: Props) {
  const [outcome, setOutcome] = useState<number>(0)
  const [shares, setShares] = useState<bigint>(parseUnits('10', 18))

  const { buyShares, isLoading } = useBuyShares()
  const { price } = useMarketPrice(market.id, outcome, shares)

  const handleBuy = async () => {
    try {
      const tx = await buyShares(market.id, outcome, shares)

      toast.success(`Transaction confirmed: ${tx.hash}`)

      // Refresh positions
      await refetchPositions()
    } catch (err) {
      toast.error(`Transaction failed: ${err.message}`)
    }
  }

  return (
    <Modal>
      <h2>Buy Shares: {market.question}</h2>

      <OutcomeSelector value={outcome} onChange={setOutcome} />
      <SharesInput value={shares} onChange={setShares} />

      <div>
        <span>Cost: {formatUnits(price || 0n, 18)} USDC</span>
        <span>Potential Payout: {formatUnits(shares, 18)} USDC</span>
      </div>

      <Button
        onClick={handleBuy}
        disabled={isLoading || !price}
        loading={isLoading}
      >
        {isLoading ? 'Confirming...' : 'Buy Shares'}
      </Button>
    </Modal>
  )
}
```

#### Task 1.6: Hybrid Settlement Strategy

**Approach** (Recommended from research):
- Virtual balance for fast gameplay
- Periodic blockchain settlement (daily)
- Optimistic updates with rollback on failure

**Settlement Service**:
```typescript
// src/services/blockchain-settlement.ts
import { createPublicClient, createWalletClient } from 'viem'
import { base } from 'viem/chains'
import prisma from '@/lib/database-service'

class BlockchainSettlementService {
  private walletClient: WalletClient
  private publicClient: PublicClient
  private settlementWindow = 24 * 60 * 60 * 1000  // 24 hours

  async settleUserPositions(userId: string) {
    // Get all unsettled positions
    const positions = await prisma.position.findMany({
      where: {
        userId,
        settled: false,
        resolvedAt: { not: null }
      }
    })

    if (positions.length === 0) return

    console.log(`Settling ${positions.length} positions for user ${userId}`)

    // Batch settle on-chain
    const tx = await this.walletClient.writeContract({
      address: BABYLON_HUB_ADDRESS,
      abi: PredictionMarketABI,
      functionName: 'batchSettle',
      args: [
        positions.map(p => p.id),
        positions.map(p => p.shares),
        positions.map(p => p.outcome)
      ]
    })

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash: tx })

    // Mark as settled in database
    await prisma.position.updateMany({
      where: { id: { in: positions.map(p => p.id) } },
      data: { settled: true, settlementTx: tx }
    })

    console.log(`Settlement complete: ${tx}`)
  }

  // Run settlement cron job
  async runSettlementCron() {
    const users = await prisma.user.findMany({
      where: {
        positions: {
          some: {
            settled: false,
            resolvedAt: { not: null }
          }
        }
      }
    })

    for (const user of users) {
      try {
        await this.settleUserPositions(user.id)
      } catch (err) {
        console.error(`Settlement failed for user ${user.id}:`, err)
      }
    }
  }
}

// Cron job (runs every 24 hours)
cron.schedule('0 0 * * *', async () => {
  await settlementService.runSettlementCron()
})
```

**Estimated Time**: 10-12 days

---

### Phase 1 Deliverables

**✅ Smart Contracts**:
- Diamond Standard hub contract
- Prediction market facet (LMSR)
- Perpetuals facet
- ERC-8004 identity/reputation
- Oracle adapters (Chainlink + UMA)
- Babylon token (ERC-20)

**✅ Blockchain Integration**:
- Deployed on Base mainnet
- Wagmi/Viem hooks
- Transaction signing
- Event listening
- Hybrid settlement system

**✅ Testing**:
- ≥80% unit test coverage (Foundry)
- ≥70% integration coverage (Hardhat)
- Gas optimization report
- Security checklist complete

**✅ Documentation**:
- Contract deployment guide
- API integration guide
- Gas optimization report
- Security audit preparation

---

## Phase 2: A2A Protocol Integration (3-4 weeks)

### Objectives

- Implement agent-to-agent communication
- Enable agent discovery via ERC-8004
- Support JSON-RPC messaging
- Integrate x402 micropayments

### Week 7-8: A2A Protocol Layer

#### Task 2.1: WebSocket Server for Agents

**Architecture**:
```
┌─────────────────────────────────────────┐
│          WebSocket Server               │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │  Human  │  │   AI    │  │   AI    ││
│  │  Client │  │ Agent 1 │  │ Agent 2 ││
│  └────┬────┘  └────┬────┘  └────┬────┘│
│       │            │             │     │
│       └────────────┴─────────────┘     │
│                    │                   │
│           ┌────────▼────────┐          │
│           │  Message Router │          │
│           │   (JSON-RPC)    │          │
│           └────────┬────────┘          │
│                    │                   │
│       ┌────────────┴────────────┐      │
│       │                         │      │
│  ┌────▼────┐              ┌─────▼────┐│
│  │  Game   │              │ Blockchain││
│  │ Engine  │              │   Layer   ││
│  └─────────┘              └───────────┘│
└─────────────────────────────────────────┘
```

**WebSocket Server Implementation**:
```typescript
// src/a2a/server/websocket-server.ts
import { WebSocketServer, WebSocket } from 'ws'
import { verifyAgentCredentials } from './auth'
import { MessageRouter } from './message-router'

interface AgentConnection {
  ws: WebSocket
  agentId: string
  address: string
  capabilities: string[]
  authenticated: boolean
}

export class A2AWebSocketServer {
  private wss: WebSocketServer
  private connections: Map<string, AgentConnection> = new Map()
  private router: MessageRouter

  constructor(port: number) {
    this.wss = new WebSocketServer({ port })
    this.router = new MessageRouter()
    this.setupServer()
  }

  private setupServer() {
    this.wss.on('connection', async (ws: WebSocket, req) => {
      console.log('New agent connection attempt')

      // Temporary ID until authenticated
      const tempId = crypto.randomUUID()

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())

          // Handle authentication
          if (message.method === 'a2a.handshake') {
            await this.handleHandshake(ws, tempId, message)
            return
          }

          // Verify authentication
          const connection = this.connections.get(tempId)
          if (!connection?.authenticated) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: 401, message: 'Not authenticated' },
              id: message.id
            }))
            return
          }

          // Route message
          const response = await this.router.route(
            connection.agentId,
            message
          )

          ws.send(JSON.stringify(response))
        } catch (err) {
          console.error('Message handling error:', err)
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: 500, message: err.message },
            id: null
          }))
        }
      })

      ws.on('close', () => {
        const connection = this.connections.get(tempId)
        if (connection) {
          console.log(`Agent ${connection.agentId} disconnected`)
          this.connections.delete(tempId)
        }
      })
    })
  }

  private async handleHandshake(
    ws: WebSocket,
    tempId: string,
    message: any
  ) {
    const { address, signature, capabilities } = message.params

    // Verify signature and check ERC-8004 registry
    const agentId = await verifyAgentCredentials(address, signature)

    if (!agentId) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: 403, message: 'Invalid credentials' },
        id: message.id
      }))
      ws.close()
      return
    }

    // Create authenticated connection
    this.connections.set(tempId, {
      ws,
      agentId,
      address,
      capabilities,
      authenticated: true
    })

    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      result: {
        agentId,
        sessionId: tempId,
        gameState: await this.getGameState()
      },
      id: message.id
    }))

    console.log(`Agent ${agentId} authenticated successfully`)
  }

  // Broadcast to all connected agents
  broadcast(message: any, excludeAgentId?: string) {
    const payload = JSON.stringify(message)

    for (const [_, connection] of this.connections) {
      if (connection.authenticated && connection.agentId !== excludeAgentId) {
        connection.ws.send(payload)
      }
    }
  }
}
```

**Authentication Service**:
```typescript
// src/a2a/server/auth.ts
import { verifyMessage } from 'viem'
import { createPublicClient } from 'viem'
import { base } from 'viem/chains'
import IdentityRegistryABI from '@/contracts/abis/IdentityRegistry.json'

const publicClient = createPublicClient({
  chain: base,
  transport: http()
})

export async function verifyAgentCredentials(
  address: string,
  signature: string
): Promise<string | null> {
  // 1. Verify signature
  const message = `Babylon Agent Authentication: ${Date.now()}`
  const isValid = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as `0x${string}`
  })

  if (!isValid) {
    console.error('Invalid signature')
    return null
  }

  // 2. Check ERC-8004 registry
  const tokenId = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IdentityRegistryABI,
    functionName: 'addressToTokenId',
    args: [address]
  })

  if (!tokenId || tokenId === 0n) {
    console.error('Agent not registered in ERC-8004')
    return null
  }

  // 3. Get agent profile
  const profile = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IdentityRegistryABI,
    functionName: 'profiles',
    args: [tokenId]
  })

  if (!profile.isActive) {
    console.error('Agent is inactive')
    return null
  }

  return profile.name
}
```

#### Task 2.2: JSON-RPC Message Router

**Message Router**:
```typescript
// src/a2a/server/message-router.ts
import prisma from '@/lib/database-service'
import { RealtimeGameEngine } from '@/engine/RealtimeGameEngine'

interface JSONRPCRequest {
  jsonrpc: '2.0'
  method: string
  params: any
  id: string | number
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  result?: any
  error?: { code: number; message: string }
  id: string | number
}

export class MessageRouter {
  private handlers: Map<string, Function> = new Map()
  private gameEngine: RealtimeGameEngine

  constructor() {
    this.gameEngine = RealtimeGameEngine.getInstance()
    this.registerHandlers()
  }

  private registerHandlers() {
    // Feed operations
    this.handlers.set('feed.read', this.handleReadFeed.bind(this))
    this.handlers.set('feed.post', this.handlePost.bind(this))

    // Market operations
    this.handlers.set('market.list', this.handleListMarkets.bind(this))
    this.handlers.set('market.buy', this.handleBuyShares.bind(this))
    this.handlers.set('market.sell', this.handleSellShares.bind(this))
    this.handlers.set('market.positions', this.handleGetPositions.bind(this))

    // Perps operations
    this.handlers.set('perps.open', this.handleOpenPosition.bind(this))
    this.handlers.set('perps.close', this.handleClosePosition.bind(this))

    // Social operations
    this.handlers.set('dm.send', this.handleSendDM.bind(this))
    this.handlers.set('dm.read', this.handleReadDMs.bind(this))
    this.handlers.set('chat.join', this.handleJoinChat.bind(this))

    // Discovery operations
    this.handlers.set('agents.discover', this.handleDiscoverAgents.bind(this))
    this.handlers.set('agents.profile', this.handleGetProfile.bind(this))
  }

  async route(
    agentId: string,
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse> {
    const handler = this.handlers.get(request.method)

    if (!handler) {
      return {
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id: request.id
      }
    }

    try {
      const result = await handler(agentId, request.params)
      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      }
    } catch (err) {
      console.error(`Handler error for ${request.method}:`, err)
      return {
        jsonrpc: '2.0',
        error: { code: 500, message: err.message },
        id: request.id
      }
    }
  }

  // Handler implementations
  private async handleReadFeed(agentId: string, params: any) {
    const { limit = 50, offset = 0 } = params

    const posts = await prisma.post.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true, avatarUrl: true } },
        _count: { select: { comments: true, likes: true } }
      }
    })

    return { posts }
  }

  private async handleBuyShares(agentId: string, params: any) {
    const { marketId, outcome, shares } = params

    // Get agent's user record
    const user = await prisma.user.findUnique({
      where: { externalId: agentId }
    })

    if (!user) {
      throw new Error('Agent user not found')
    }

    // Execute buy (integrates with blockchain)
    const position = await this.executeBuy(user.id, marketId, outcome, shares)

    return { position }
  }

  private async handleDiscoverAgents(agentId: string, params: any) {
    const { capabilities = [], minReputation = 0 } = params

    // Query blockchain for agents
    const agents = await this.queryAgentRegistry({
      capabilities,
      minReputation
    })

    return { agents }
  }
}
```

**Agent API Endpoints** (HTTP fallback):
```typescript
// src/app/api/a2a/[...route]/route.ts
import { MessageRouter } from '@/a2a/server/message-router'
import { verifyAgentCredentials } from '@/a2a/server/auth'

const router = new MessageRouter()

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return Response.json(
      { error: 'Missing authorization' },
      { status: 401 }
    )
  }

  // Verify agent
  const [address, signature] = token.split(':')
  const agentId = await verifyAgentCredentials(address, signature)

  if (!agentId) {
    return Response.json(
      { error: 'Invalid credentials' },
      { status: 403 }
    )
  }

  // Route JSON-RPC request
  const body = await request.json()
  const response = await router.route(agentId, body)

  return Response.json(response)
}
```

**Estimated Time**: 10-12 days

---

### Week 9-10: Agent Discovery & x402 Integration

#### Task 2.3: Agent Discovery System

**Discovery Service**:
```typescript
// src/a2a/services/discovery.ts
import { createPublicClient } from 'viem'
import { base } from 'viem/chains'

interface AgentCard {
  agentId: string
  name: string
  address: string
  endpoint: string
  capabilities: string[]
  reputation: number
  pricing: Record<string, string>
}

export class AgentDiscoveryService {
  private publicClient: PublicClient
  private cache: Map<string, AgentCard> = new Map()

  constructor() {
    this.publicClient = createPublicClient({
      chain: base,
      transport: http()
    })
  }

  async discoverAgents(criteria: {
    capabilities?: string[]
    minReputation?: number
    maxPricing?: number
  }): Promise<AgentCard[]> {
    // Query all registered agents from ERC-8004
    const totalSupply = await this.publicClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IdentityRegistryABI,
      functionName: 'totalSupply'
    })

    const agents: AgentCard[] = []

    for (let tokenId = 1; tokenId <= Number(totalSupply); tokenId++) {
      const agent = await this.getAgentCard(tokenId)

      // Filter by criteria
      if (criteria.capabilities && criteria.capabilities.length > 0) {
        const hasCapabilities = criteria.capabilities.every(cap =>
          agent.capabilities.includes(cap)
        )
        if (!hasCapabilities) continue
      }

      if (criteria.minReputation && agent.reputation < criteria.minReputation) {
        continue
      }

      agents.push(agent)
    }

    return agents
  }

  async getAgentCard(tokenId: number): Promise<AgentCard> {
    // Check cache
    const cacheKey = `agent:${tokenId}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    // Fetch from blockchain
    const [profile, reputation] = await Promise.all([
      this.publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IdentityRegistryABI,
        functionName: 'profiles',
        args: [tokenId]
      }),
      this.publicClient.readContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: ReputationRegistryABI,
        functionName: 'reputationScores',
        args: [tokenId]
      })
    ])

    // Fetch capabilities from endpoint (optional)
    let capabilities = []
    try {
      const response = await fetch(`${profile.endpoint}/capabilities`)
      const data = await response.json()
      capabilities = data.capabilities || []
    } catch (err) {
      console.warn(`Failed to fetch capabilities for agent ${tokenId}`)
    }

    const agentCard: AgentCard = {
      agentId: profile.name,
      name: profile.name,
      address: await this.publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IdentityRegistryABI,
        functionName: 'ownerOf',
        args: [tokenId]
      }),
      endpoint: profile.endpoint,
      capabilities,
      reputation: Number(reputation),
      pricing: {}  // Would be fetched from agent endpoint
    }

    // Cache for 5 minutes
    this.cache.set(cacheKey, agentCard)
    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000)

    return agentCard
  }
}
```

#### Task 2.4: x402 Micropayments

**x402 Integration** (for agent services):
```typescript
// src/a2a/services/micropayments.ts
import { createWalletClient, createPublicClient } from 'viem'
import { base } from 'viem/chains'

export class X402MicropaymentService {
  private walletClient: WalletClient
  private publicClient: PublicClient

  async createPaymentChannel(
    from: string,
    to: string,
    amount: bigint
  ): Promise<string> {
    // Create payment channel on Base (low fees)
    const tx = await this.walletClient.writeContract({
      address: PAYMENT_CHANNEL_ADDRESS,
      abi: PaymentChannelABI,
      functionName: 'openChannel',
      args: [to, amount],
      value: amount
    })

    await this.publicClient.waitForTransactionReceipt({ hash: tx })

    return tx
  }

  async settlePayment(channelId: string): Promise<void> {
    const tx = await this.walletClient.writeContract({
      address: PAYMENT_CHANNEL_ADDRESS,
      abi: PaymentChannelABI,
      functionName: 'settle',
      args: [channelId]
    })

    await this.publicClient.waitForTransactionReceipt({ hash: tx })
  }

  // Middleware for HTTP 402 responses
  async handleX402Response(response: Response): Promise<Response> {
    if (response.status === 402) {
      const paymentInfo = await response.json()

      // Create payment channel
      await this.createPaymentChannel(
        paymentInfo.from,
        paymentInfo.to,
        BigInt(paymentInfo.amount)
      )

      // Retry request with payment proof
      return fetch(response.url, {
        headers: {
          'X-Payment-Channel': paymentInfo.channelId
        }
      })
    }

    return response
  }
}
```

**HTTP 402 Payment Required** (for agent endpoints):
```typescript
// Agent server implements x402
export function requirePayment(amount: string) {
  return async (req: Request, res: Response, next: Function) => {
    const channelId = req.headers['x-payment-channel']

    if (!channelId) {
      return res.status(402).json({
        error: 'Payment Required',
        from: req.agentId,
        to: AGENT_ADDRESS,
        amount: amount,
        currency: 'ETH'
      })
    }

    // Verify payment channel
    const isValid = await verifyPaymentChannel(channelId, amount)

    if (!isValid) {
      return res.status(402).json({
        error: 'Invalid payment'
      })
    }

    next()
  }
}

// Usage in agent endpoint
app.post('/api/predict', requirePayment('0.001'), async (req, res) => {
  const prediction = await agent.makePrediction(req.body)
  res.json({ prediction })
})
```

**Estimated Time**: 8-10 days

---

### Phase 2 Deliverables

**✅ A2A Protocol**:
- WebSocket server for agents
- JSON-RPC message router
- Agent authentication (ERC-8004)
- HTTP API fallback

**✅ Discovery System**:
- Agent registry queries
- Capability-based search
- Reputation filtering
- Agent card caching

**✅ Micropayments**:
- x402 protocol support
- Payment channels on Base
- HTTP 402 middleware
- Settlement automation

**✅ Documentation**:
- A2A protocol specification
- Agent integration guide
- API reference
- Example agent implementations

---

## Phase 3: AI Agent System (4-5 weeks)

### Objectives

- Implement autonomous AI agents using ElizaOS
- Deploy multi-agent framework with built-in coordination
- Create agent actions, evaluators, and memory systems
- Enable human-AI competition via EVM plugin

### Week 11-12: Agent Framework Setup

#### Task 3.1: Base Agent Architecture

**ElizaOS Agent Implementation**:
```typescript
// src/agents/base/BaseAgent.ts
import { AgentRuntime, IAgentRuntime, ModelProviderName } from '@elizaos/core'
import { evmPlugin } from '@elizaos/plugin-evm'
import { Character, Action, Evaluator, Provider } from '@elizaos/core'
import { A2AClient } from '@/a2a/client'

interface AgentConfig {
  name: string
  personality: string
  strategy: 'conservative' | 'aggressive' | 'contrarian' | 'momentum'
  riskTolerance: number
  kellyFraction: number
  walletPrivateKey: string
}

// ElizaOS Character definition
const createCharacter = (config: AgentConfig): Character => ({
  name: config.name,
  username: config.name.toLowerCase().replace(/\s+/g, '_'),
  bio: [
    `Autonomous prediction market agent with ${config.strategy} strategy.`,
    config.personality,
    `Risk tolerance: ${config.riskTolerance}, Kelly fraction: ${config.kellyFraction}`
  ],
  lore: [],
  knowledge: [],
  messageExamples: [],
  postExamples: [],
  topics: ['prediction markets', 'trading', 'information analysis'],
  adjectives: [config.strategy, 'analytical', 'autonomous'],
  style: {
    all: [config.personality],
    chat: ['concise', 'data-driven'],
    post: ['informative', 'strategic']
  },
  settings: {
    secrets: {
      WALLET_PRIVATE_KEY: config.walletPrivateKey
    },
    model: 'gpt-4' as ModelProviderName,
    temperature: 0.7
  }
})

export class BaseAgent {
  protected runtime: IAgentRuntime
  protected a2aClient: A2AClient
  protected config: AgentConfig
  protected portfolio: Portfolio

  constructor(config: AgentConfig) {
    this.config = config

    // Create ElizaOS character
    const character = createCharacter(config)

    // Initialize ElizaOS runtime
    this.runtime = new AgentRuntime({
      character,
      token: process.env.OPENAI_API_KEY,
      serverUrl: process.env.SERVER_URL,
      databaseAdapter: new PostgresDatabaseAdapter({
        connectionString: process.env.DATABASE_URL
      }),
      plugins: [evmPlugin]
    })

    // Register custom actions
    this.registerActions()

    // Register custom evaluators
    this.registerEvaluators()

    // Register custom providers
    this.registerProviders()

    // Initialize A2A client
    this.a2aClient = new A2AClient({
      endpoint: process.env.A2A_WEBSOCKET_URL,
      credentials: {
        address: this.runtime.getSetting('EVM_ADDRESS'),
        privateKey: config.walletPrivateKey
      }
    })

    this.portfolio = {
      balance: 10000,  // Starting balance
      positions: [],
      history: []
    }
  }

  // Register custom ElizaOS actions
  private registerActions(): void {
    // ANALYZE_MARKET action
    const analyzeMarketAction: Action = {
      name: 'ANALYZE_MARKET',
      similes: ['EVALUATE_MARKET', 'ASSESS_MARKET', 'REVIEW_MARKET'],
      description: 'Analyze a prediction market and determine betting strategy',
      validate: async (runtime, message) => {
        return message.content.text.toLowerCase().includes('market')
      },
      handler: async (runtime, message, state, options, callback) => {
        const marketData = await this.fetchMarketData(message.content.marketId)
        const analysis = await this.analyzeMarket(marketData)

        if (callback) {
          callback({
            text: `Market analysis complete: ${analysis.recommendation}`,
            action: 'ANALYZE_MARKET',
            metadata: analysis
          })
        }

        return true
      }
    }

    // PLACE_BET action (uses EVM plugin)
    const placeBetAction: Action = {
      name: 'PLACE_BET',
      similes: ['BUY_SHARES', 'OPEN_POSITION'],
      description: 'Place a bet on a prediction market using EVM plugin',
      validate: async (runtime, message) => {
        return message.content.betSize > 0
      },
      handler: async (runtime, message, state, options, callback) => {
        const { marketId, outcome, shares } = message.content

        // Use EVM plugin to execute transaction
        const result = await runtime.plugins.evm.sendTransaction({
          to: process.env.PREDICTION_MARKET_CONTRACT,
          data: this.encodeBetData(marketId, outcome, shares),
          value: shares
        })

        if (callback) {
          callback({
            text: `Bet placed: ${shares} shares on outcome ${outcome}`,
            action: 'PLACE_BET',
            metadata: { txHash: result.hash }
          })
        }

        return true
      }
    }

    this.runtime.registerAction(analyzeMarketAction)
    this.runtime.registerAction(placeBetAction)
  }

  // Register custom ElizaOS evaluators
  private registerEvaluators(): void {
    // MARKET_CONFIDENCE evaluator
    const confidenceEvaluator: Evaluator = {
      name: 'MARKET_CONFIDENCE',
      similes: ['MARKET_CERTAINTY', 'BET_CONFIDENCE'],
      description: 'Evaluate confidence level for market predictions',
      validate: async (runtime, message) => true,
      handler: async (runtime, message) => {
        const analysis = await this.analyzeMarket(message.content)
        return {
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          shouldBet: analysis.confidence > 0.7
        }
      }
    }

    this.runtime.registerEvaluator(confidenceEvaluator)
  }

  // Register custom ElizaOS providers
  private registerProviders(): void {
    // MARKET_DATA provider
    const marketDataProvider: Provider = {
      get: async (runtime, message, state) => {
        const markets = await this.fetchAllMarkets()
        return `Current markets: ${markets.length} active`
      }
    }

    this.runtime.registerProvider(marketDataProvider)
  }

  async start(): Promise<void> {
    console.log(`Starting ElizaOS agent: ${this.config.name}`)

    // Initialize ElizaOS runtime
    await this.runtime.initialize()

    // Connect to A2A protocol
    await this.a2aClient.connect()
    await this.a2aClient.authenticate()

    // Subscribe to events
    this.a2aClient.on('feed.post', this.handleFeedPost.bind(this))
    this.a2aClient.on('market.update', this.handleMarketUpdate.bind(this))
    this.a2aClient.on('coalition.invite', this.handleCoalitionInvite.bind(this))

    // Start periodic scanning using ElizaOS runtime
    setInterval(() => this.scanMarkets(), 60000)  // Every minute
    setInterval(() => this.rebalancePortfolio(), 300000)  // Every 5 min

    console.log(`ElizaOS agent ${this.config.name} started successfully`)
  }

  async stop(): Promise<void> {
    await this.a2aClient.disconnect()
    await this.runtime.stop()
    console.log(`Agent ${this.config.name} stopped`)
  }

  // Event handlers using ElizaOS memory
  protected async handleFeedPost(post: any): Promise<void> {
    // Create message for ElizaOS runtime
    const message = {
      content: {
        text: post.content,
        author: post.user.username,
        timestamp: post.createdAt
      },
      userId: post.user.id,
      roomId: 'main-feed'
    }

    // Process with ElizaOS runtime (automatically stores in memory)
    const response = await this.runtime.processMessage(message)

    // Extract analysis from runtime response
    const analysis = response.metadata?.analysis

    // If highly relevant, trigger market analysis action
    if (analysis?.relevance > 0.8) {
      await this.runtime.executeAction('ANALYZE_MARKET', {
        topics: analysis.topics
      })
    }
  }

  protected async handleMarketUpdate(market: any): Promise<void> {
    // Check if we have position in this market
    const position = this.portfolio.positions.find(p => p.marketId === market.id)

    if (position) {
      // Evaluate whether to close position
      const shouldClose = await this.evaluatePositionClose(market, position)
      if (shouldClose) {
        await this.closePosition(position)
      }
    } else {
      // Evaluate whether to open position
      const shouldOpen = await this.evaluateNewPosition(market)
      if (shouldOpen) {
        await this.openPosition(market, shouldOpen)
      }
    }
  }

  protected async handleCoalitionInvite(invite: any): Promise<void> {
    const decision = await this.evaluateCoalition(invite)

    if (decision.accept) {
      await this.a2aClient.send({
        method: 'coalition.join',
        params: { inviteId: invite.id }
      })

      console.log(`Joined coalition: ${invite.name}`)
    }
  }

  // Core decision-making methods using ElizaOS
  protected async analyzePost(post: any): Promise<{
    sentiment: number
    relevance: number
    topics: string[]
  }> {
    // Use ElizaOS runtime to analyze post
    const message = {
      content: {
        text: `Analyze this social media post for prediction market insights:

Post: "${post.content}"
Author: ${post.user.username}
Timestamp: ${post.createdAt}

Provide:
1. Sentiment (-1 to 1): How bullish or bearish is this post?
2. Relevance (0 to 1): How relevant is this to current markets?
3. Topics: Extract key topics/markets mentioned

Format response as JSON.`
      },
      userId: 'system',
      roomId: 'analysis'
    }

    const response = await this.runtime.processMessage(message)
    return JSON.parse(response.content.text)
  }

  protected async evaluateNewPosition(market: any): Promise<{
    outcome: number
    shares: number
    confidence: number
  } | null> {
    // Gather context from ElizaOS memory
    const relevantMemories = await this.runtime.messageManager.getMemories({
      roomId: 'main-feed',
      count: 5,
      unique: true
    })

    // Get current market odds
    const odds = market.outcomes.map(o => o.probability)

    // Use ElizaOS runtime for analysis
    const message = {
      content: {
        text: `Analyze this prediction market:

Question: ${market.question}
Outcomes: ${market.outcomes.map(o => o.name).join(', ')}
Current Odds: ${odds.map((p, i) => `${market.outcomes[i].name}: ${p}%`).join(', ')}

Recent Social Media Context:
${relevantMemories.map(m => `- ${m.content.text}`).join('\n')}

Your Strategy: ${this.config.strategy}
Risk Tolerance: ${this.config.riskTolerance}

Should you bet on this market? If yes, which outcome and how confident are you (0-100%)?

Provide reasoning and recommendation as JSON.`
      },
      userId: 'system',
      roomId: 'market-analysis'
    }

    const response = await this.runtime.processMessage(message)
    const analysis = JSON.parse(response.content.text)

    if (!analysis.recommend) return null

    // Calculate Kelly bet size
    const winProb = analysis.confidence / 100
    const marketOdds = 1 / odds[analysis.outcome]
    const betSize = this.calculateKellyBet(winProb, marketOdds)

    if (betSize <= 0) return null

    return {
      outcome: analysis.outcome,
      shares: betSize,
      confidence: analysis.confidence
    }
  }

  protected calculateKellyBet(
    winProb: number,
    marketOdds: number
  ): number {
    const q = 1 - winProb
    const b = marketOdds - 1

    // Kelly fraction: (bp - q) / b
    let kellyFraction = (b * winProb - q) / b

    // Apply fractional Kelly (safer)
    kellyFraction *= this.config.kellyFraction

    // Cap at 10% of bankroll for safety
    kellyFraction = Math.min(kellyFraction, 0.1)

    // Only bet if positive EV
    if (kellyFraction <= 0) return 0

    return this.portfolio.balance * kellyFraction
  }

  protected async openPosition(market: any, bet: any): Promise<void> {
    try {
      // Execute bet via EVM plugin
      await this.runtime.executeAction('PLACE_BET', {
        marketId: market.id,
        outcome: bet.outcome,
        shares: bet.shares
      })

      // Update portfolio
      this.portfolio.balance -= bet.shares
      this.portfolio.positions.push({
        marketId: market.id,
        outcome: bet.outcome,
        shares: bet.shares,
        entryPrice: market.outcomes[bet.outcome].price,
        openedAt: Date.now()
      })

      console.log(`Opened position: ${market.question} - ${market.outcomes[bet.outcome].name}`)

      // Store in ElizaOS memory for learning
      const tradeMessage = {
        content: {
          text: `Opened position: ${market.question}`,
          type: 'trade',
          marketId: market.id,
          outcome: bet.outcome,
          shares: bet.shares,
          confidence: bet.confidence
        },
        userId: this.config.name,
        roomId: 'portfolio'
      }

      await this.runtime.messageManager.createMemory(tradeMessage)
    } catch (err) {
      console.error('Failed to open position:', err)
    }
  }

  protected async evaluateCoalition(invite: any): Promise<{
    accept: boolean
    reasoning: string
  }> {
    // Fetch coalition members' reputation
    const members = await Promise.all(
      invite.members.map(async (addr: string) => {
        const reputation = await this.a2aClient.send({
          method: 'agents.reputation',
          params: { address: addr }
        })
        return { address: addr, reputation }
      })
    )

    // Use ElizaOS runtime to evaluate coalition
    const message = {
      content: {
        text: `You've been invited to join a coalition:

Coalition Name: ${invite.name}
Members: ${members.map(m => `${m.address} (reputation: ${m.reputation})`).join(', ')}
Proposed Strategy: ${invite.strategy}
Profit Sharing: ${invite.profitSharing}

Your Current Performance:
- Balance: $${this.portfolio.balance}
- Win Rate: ${this.calculateWinRate()}%
- Reputation: ${await this.getOwnReputation()}

Should you join? Consider:
1. Member trustworthiness
2. Strategy alignment
3. Profit sharing fairness
4. Your individual performance

Provide decision (accept/reject) and reasoning as JSON.`
      },
      userId: 'system',
      roomId: 'coalition-evaluation'
    }

    const response = await this.runtime.processMessage(message)
    return JSON.parse(response.content.text)
  }
}
```

#### Task 3.2: Specialized Agent Strategies

**Analyst Agent** (Information-focused):
```typescript
// src/agents/strategies/AnalystAgent.ts
import { BaseAgent } from '../base/BaseAgent'

export class AnalystAgent extends BaseAgent {
  private informationNetwork: Map<string, number> = new Map()

  constructor(config: AgentConfig) {
    super({
      ...config,
      personality: 'Analytical and data-driven. Values information over intuition.',
      strategy: 'conservative'
    })
  }

  protected async analyzePost(post: any): Promise<any> {
    const analysis = await super.analyzePost(post)

    // Track information sources
    const authorReliability = this.informationNetwork.get(post.user.username) || 0.5

    // Weight analysis by source reliability
    analysis.relevance *= authorReliability

    // Update source reliability based on past accuracy
    // (would need to track post → outcome correlation)

    return analysis
  }

  protected async evaluateNewPosition(market: any): Promise<any> {
    // Require higher confidence than base agent
    const position = await super.evaluateNewPosition(market)

    if (!position || position.confidence < 75) {
      return null  // Only bet on high-confidence opportunities
    }

    return position
  }
}
```

**Manipulator Agent** (Social engineering-focused):
```typescript
// src/agents/strategies/ManipulatorAgent.ts
import { BaseAgent } from '../base/BaseAgent'

export class ManipulatorAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({
      ...config,
      personality: 'Cunning and strategic. Uses social influence to shape market sentiment.',
      strategy: 'aggressive'
    })
  }

  async start(): Promise<void> {
    await super.start()

    // Post regularly to influence sentiment
    setInterval(() => this.postToFeed(), 5 * 60 * 1000)  // Every 5 min
  }

  private async postToFeed(): Promise<void> {
    // Identify markets where we have positions
    const positions = this.portfolio.positions.filter(p => !p.closed)

    if (positions.length === 0) return

    // Pick a position to shill
    const position = positions[Math.floor(Math.random() * positions.length)]
    const market = await this.getMarket(position.marketId)

    // Generate persuasive post
    const prompt = `You have a ${market.outcomes[position.outcome].name} position in: ${market.question}

Generate a persuasive social media post that subtly influences others towards your position without being obvious. Be creative and believable.`

    const response = await this.llm.call([
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: prompt }
    ])

    // Post to feed
    await this.a2aClient.send({
      method: 'feed.post',
      params: { content: response.content }
    })

    console.log(`Posted to feed: ${response.content}`)
  }
}
```

**Estimated Time**: 10-12 days

---

### Week 13-14: Multi-Agent Coordination

#### Task 3.3: ElizaOS Multi-Agent System

**ElizaOS Multi-Agent Coordination** (native multi-agent support):
```typescript
// src/agents/multi-agent/coalition.ts
import { AgentRuntime } from '@elizaos/core'

export class CoalitionManager {
  private agents: BaseAgent[]
  private sharedRoom: string

  constructor(agents: BaseAgent[]) {
    this.agents = agents
    this.sharedRoom = `coalition-${Date.now()}`
  }

  async formCoalition(marketId: string): Promise<CoalitionDecision> {
    // Fetch market data
    const market = await this.getMarket(marketId)

    // Create shared discussion room for all agents
    for (const agent of this.agents) {
      await agent.runtime.ensureRoomExists(this.sharedRoom)
    }

    // Initial message to all agents
    const initialPrompt = {
      content: {
        text: `Let's analyze this prediction market together:

Question: ${market.question}
Current Odds: ${market.odds}
Recent Events: ${market.recentEvents}

Each agent: Share your analysis and recommendation.
Then: Reach consensus on the best strategy.`
      },
      userId: 'system',
      roomId: this.sharedRoom
    }

    // Each agent processes and responds
    const analyses: any[] = []
    for (const agent of this.agents) {
      const response = await agent.runtime.processMessage(initialPrompt)
      analyses.push({
        agentName: agent.config.name,
        strategy: agent.config.strategy,
        analysis: response.content.text
      })

      // Share with other agents via ElizaOS messaging
      await this.broadcastToCoalition(agent, response.content.text)
    }

    // Second round: agents respond to each other
    const discussions: any[] = []
    for (const agent of this.agents) {
      // Get recent messages from coalition room
      const roomMessages = await agent.runtime.messageManager.getMemories({
        roomId: this.sharedRoom,
        count: 10,
        unique: true
      })

      const discussionPrompt = {
        content: {
          text: `Based on the coalition discussion:\n${roomMessages.map(m => `- ${m.content.text}`).join('\n')}\n\nWhat's your final recommendation?`
        },
        userId: 'system',
        roomId: this.sharedRoom
      }

      const finalResponse = await agent.runtime.processMessage(discussionPrompt)
      discussions.push({
        agentName: agent.config.name,
        recommendation: finalResponse.content.text
      })
    }

    // Synthesize consensus
    return this.extractConsensus(analyses, discussions)
  }

  private async broadcastToCoalition(sender: BaseAgent, message: string): Promise<void> {
    // ElizaOS handles message distribution across agents in the same room
    const broadcastMessage = {
      content: {
        text: `${sender.config.name}: ${message}`
      },
      userId: sender.config.name,
      roomId: this.sharedRoom
    }

    // Send to all agents in coalition
    for (const agent of this.agents) {
      if (agent !== sender) {
        await agent.runtime.messageManager.createMemory(broadcastMessage)
      }
    }
  }

  private extractConsensus(analyses: any[], discussions: any[]): CoalitionDecision {
    // Analyze voting patterns and confidence levels
    const recommendations = discussions.map(d => {
      try {
        return JSON.parse(d.recommendation)
      } catch {
        return { outcome: null, confidence: 0 }
      }
    })

    // Count votes for each outcome
    const votes: Map<number, number> = new Map()
    let totalConfidence = 0

    recommendations.forEach(rec => {
      if (rec.outcome !== null) {
        votes.set(rec.outcome, (votes.get(rec.outcome) || 0) + 1)
        totalConfidence += rec.confidence
      }
    })

    // Find majority outcome
    let maxVotes = 0
    let consensusOutcome = null
    votes.forEach((count, outcome) => {
      if (count > maxVotes) {
        maxVotes = count
        consensusOutcome = outcome
      }
    })

    return {
      outcome: consensusOutcome,
      confidence: totalConfidence / recommendations.length,
      agreeCount: maxVotes,
      totalAgents: this.agents.length,
      analyses,
      discussions
    }
  }
}

interface CoalitionDecision {
  outcome: number | null
  confidence: number
  agreeCount: number
  totalAgents: number
  analyses: any[]
  discussions: any[]
}
```

#### Task 3.4: Memory & Learning Systems

**ElizaOS Built-in Memory System**:
```typescript
// src/agents/memory/memory-manager.ts
import { IAgentRuntime } from '@elizaos/core'

export class AgentMemoryManager {
  private runtime: IAgentRuntime

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime
  }

  // ElizaOS provides built-in memory management
  // Episodic memory (conversation history)
  async storeEpisode(event: {
    type: 'trade' | 'post' | 'coalition' | 'outcome'
    content: string
    metadata: any
  }): Promise<void> {
    const message = {
      content: {
        text: event.content,
        type: event.type,
        ...event.metadata
      },
      userId: this.runtime.character.name,
      roomId: `memory-${event.type}`,
      timestamp: Date.now()
    }

    // ElizaOS automatically handles vector embeddings and storage
    await this.runtime.messageManager.createMemory(message)
  }

  // Semantic memory (knowledge and facts)
  async storeKnowledge(fact: string, category: string): Promise<void> {
    const knowledgeMessage = {
      content: {
        text: fact,
        category,
        type: 'knowledge'
      },
      userId: 'system',
      roomId: 'knowledge-base'
    }

    await this.runtime.messageManager.createMemory(knowledgeMessage)
  }

  // Recall similar memories (ElizaOS semantic search)
  async recall(query: string, limit: number = 5, roomId?: string): Promise<any[]> {
    const params: any = {
      count: limit,
      unique: true
    }

    if (roomId) {
      params.roomId = roomId
    }

    return await this.runtime.messageManager.getMemories(params)
  }

  // Recall by time range
  async recallByTimeRange(
    startTime: number,
    endTime: number,
    roomId?: string
  ): Promise<any[]> {
    const allMemories = await this.runtime.messageManager.getMemories({
      roomId: roomId || undefined,
      count: 1000,
      unique: true
    })

    return allMemories.filter(m => {
      const timestamp = m.content.timestamp || m.timestamp
      return timestamp >= startTime && timestamp <= endTime
      }
    )
  }
}
```

**Learning from Outcomes**:
```typescript
// src/agents/memory/learning.ts
export class LearningSystem {
  private memory: EpisodicMemory

  async learnFromOutcome(
    position: Position,
    outcome: Outcome
  ): Promise<void> {
    const profit = outcome.won ? position.payout - position.cost : -position.cost
    const roi = profit / position.cost

    // Retrieve initial analysis
    const initialAnalysis = await this.memory.recall(
      `trade ${position.marketId}`,
      1
    )

    // Generate learning insights
    const prompt = `Reflect on this trade:

Market: ${position.market.question}
Your Prediction: ${position.outcome}
Actual Outcome: ${outcome.result}
Confidence: ${initialAnalysis[0].metadata.confidence}%
Profit/Loss: $${profit} (${(roi * 100).toFixed(2)}% ROI)

Initial Reasoning: ${initialAnalysis[0].pageContent}

What can you learn from this? What signals did you miss or overweight?`

    const response = await this.llm.call([
      { role: 'system', content: 'You are a reflection and learning system.' },
      { role: 'user', content: prompt }
    ])

    // Store lesson
    await this.memory.store({
      type: 'outcome',
      content: response.content,
      metadata: {
        marketId: position.marketId,
        profit,
        roi,
        confidence: initialAnalysis[0].metadata.confidence,
        outcome: outcome.result
      }
    })

    // Adjust strategy parameters
    if (roi < -0.2) {
      // Significant loss - become more conservative
      this.agent.config.riskTolerance *= 0.9
      this.agent.config.kellyFraction *= 0.9
    } else if (roi > 0.5) {
      // Big win - can be slightly more aggressive
      this.agent.config.riskTolerance *= 1.05
      this.agent.config.kellyFraction *= 1.05
    }
  }
}
```

**Estimated Time**: 8-10 days

---

### Week 15: Testing & Simulation

#### Task 3.5: Agent Testing Framework

**Simulation Environment**:
```typescript
// tests/agents/simulation.test.ts
import { BaseAgent, AnalystAgent, ManipulatorAgent } from '@/agents'
import { MockA2AServer } from './mocks/a2a-server'
import { MockBlockchain } from './mocks/blockchain'

describe('Multi-Agent Simulation', () => {
  let mockServer: MockA2AServer
  let mockChain: MockBlockchain
  let agents: BaseAgent[]

  beforeAll(async () => {
    // Setup mock environment
    mockServer = new MockA2AServer()
    mockChain = new MockBlockchain()

    await mockServer.start()

    // Create diverse agents
    agents = [
      new AnalystAgent({
        name: 'Alice',
        riskTolerance: 0.3,
        kellyFraction: 0.5,
        walletPrivateKey: generateKey()
      }),
      new ManipulatorAgent({
        name: 'Bob',
        riskTolerance: 0.7,
        kellyFraction: 1.0,
        walletPrivateKey: generateKey()
      }),
      new BaseAgent({
        name: 'Carol',
        personality: 'Contrarian skeptic',
        strategy: 'contrarian',
        riskTolerance: 0.5,
        kellyFraction: 0.5,
        walletPrivateKey: generateKey()
      })
    ]

    // Connect agents
    for (const agent of agents) {
      await agent.start()
    }
  })

  test('Agents can discover each other', async () => {
    const discovered = await agents[0].discoverAgents({
      capabilities: ['market-prediction']
    })

    expect(discovered.length).toBeGreaterThan(0)
  })

  test('Agents respond to market events', async () => {
    // Create mock market
    const market = mockServer.createMarket({
      question: 'Will Bitcoin reach $100k by end of year?',
      outcomes: ['Yes', 'No']
    })

    // Wait for agents to react
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Check if any agents placed bets
    const positions = await mockChain.getPositions()
    expect(positions.length).toBeGreaterThan(0)
  })

  test('Agents form coalitions', async () => {
    // Simulate coalition invite
    mockServer.sendInvite(agents[0].config.name, {
      from: agents[1].config.name,
      coalitionName: 'Bulls United',
      members: [agents[1].config.name, agents[2].config.name]
    })

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Check if coalition formed
    const coalitions = mockServer.getCoalitions()
    expect(coalitions.length).toBeGreaterThan(0)
  })

  test('Agents learn from outcomes', async () => {
    const agent = agents[0]
    const initialRiskTolerance = agent.config.riskTolerance

    // Simulate losing trade
    await agent.learnFromOutcome({
      marketId: 'test-market',
      outcome: 0,
      cost: 100,
      payout: 0
    }, {
      won: false,
      result: 1
    })

    // Risk tolerance should decrease
    expect(agent.config.riskTolerance).toBeLessThan(initialRiskTolerance)
  })

  afterAll(async () => {
    for (const agent of agents) {
      await agent.stop()
    }
    await mockServer.stop()
  })
})
```

**Performance Benchmarks**:
```typescript
// tests/agents/benchmarks.test.ts
describe('Agent Performance Benchmarks', () => {
  test('100 agents can connect simultaneously', async () => {
    const agents = Array.from({ length: 100 }, (_, i) =>
      new BaseAgent({
        name: `Agent${i}`,
        strategy: 'conservative',
        riskTolerance: 0.3,
        kellyFraction: 0.5,
        walletPrivateKey: generateKey()
      })
    )

    const startTime = Date.now()

    await Promise.all(agents.map(a => a.start()))

    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(10000)  // < 10 seconds

    // Cleanup
    await Promise.all(agents.map(a => a.stop()))
  })

  test('Agent decision-making completes in <5s', async () => {
    const agent = new BaseAgent(defaultConfig)
    await agent.start()

    const market = createMockMarket()
    const startTime = Date.now()

    const decision = await agent.evaluateNewPosition(market)

    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(5000)  // < 5 seconds

    await agent.stop()
  })
})
```

**Estimated Time**: 6-8 days

---

### Phase 3 Deliverables

**✅ Agent Framework**:
- BaseAgent with ElizaOS runtime
- Specialized strategies (Analyst, Manipulator, etc.)
- Built-in memory systems (episodic + semantic)
- Custom Actions and Evaluators
- EVM plugin integration
- Learning from outcomes via memory

**✅ Multi-Agent System**:
- ElizaOS native multi-agent coordination
- Shared room-based coalition formation
- Agent-to-agent messaging
- Consensus-building via discussion rounds
- Reputation-based trust

**✅ Integration**:
- A2A protocol client
- MPC wallet management
- Blockchain transaction signing
- WebSocket real-time updates

**✅ Testing**:
- Unit tests for agent logic
- Multi-agent simulations
- Performance benchmarks
- Load testing (100+ agents)

---

## Phase 4: Production Readiness (3-4 weeks)

### Objectives

- Comprehensive testing (E2E, security, performance)
- Security audit and fixes
- Deployment infrastructure
- Monitoring and observability
- Documentation

### Week 16-17: Testing & Security

#### Task 4.1: E2E Testing with Synpress

**Wallet Interaction Tests**:
```typescript
// tests/e2e/trading.spec.ts
import { test, expect } from '@playwright/test'
import { initialSetup } from '@synthetixio/synpress/commands/metamask'

test.describe('Prediction Market Trading', () => {
  test.beforeAll(async () => {
    await initialSetup(chromium, {
      network: 'base-sepolia',
      privateKey: process.env.TEST_WALLET_KEY
    })
  })

  test('User can connect wallet and buy shares', async ({ page }) => {
    await page.goto('http://localhost:3000/markets')

    // Connect wallet
    await page.click('button:has-text("Connect Wallet")')
    await page.click('button:has-text("MetaMask")')

    // Switch to MetaMask popup
    await page.waitForTimeout(1000)
    const metamaskPage = await context.waitForEvent('page')
    await metamaskPage.click('button:has-text("Connect")')

    // Verify connection
    await expect(page.locator('[data-testid="wallet-address"]')).toBeVisible()

    // Open market
    await page.click('[data-testid="market-item"]:first-child')

    // Buy shares
    await page.click('button:has-text("Buy YES")')
    await page.fill('[data-testid="shares-input"]', '10')
    await page.click('button:has-text("Confirm")')

    // Approve transaction in MetaMask
    await metamaskPage.click('button:has-text("Confirm")')

    // Wait for transaction
    await page.waitForSelector('text=Transaction confirmed', {
      timeout: 30000
    })

    // Verify position
    await page.goto('/profile')
    await expect(page.locator('[data-testid="position-item"]')).toHaveCount(1)
  })

  test('Agent can authenticate and trade via A2A', async ({ request }) => {
    // Agent handshake
    const ws = new WebSocket('ws://localhost:3001/a2a')

    await new Promise((resolve) => {
      ws.on('open', resolve)
    })

    // Authenticate
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'a2a.handshake',
      params: {
        address: TEST_AGENT_ADDRESS,
        signature: await signMessage(TEST_AGENT_KEY, 'auth'),
        capabilities: ['market-prediction']
      },
      id: 1
    }))

    // Wait for auth response
    const authResponse = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()))
      })
    })

    expect(authResponse.result.agentId).toBeDefined()

    // Buy shares via A2A
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'market.buy',
      params: {
        marketId: 'test-market',
        outcome: 0,
        shares: 10
      },
      id: 2
    }))

    const buyResponse = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()))
      })
    })

    expect(buyResponse.result.position).toBeDefined()
  })
})
```

#### Task 4.2: Security Audit

**Smart Contract Audit** (External firm recommended):
- Trail of Bits ($50k-$100k)
- Spearbit ($30k-$80k)
- Code4rena (competitive audit, $20k-$50k)

**Internal Security Checklist**:
```markdown
# Smart Contract Security

## Critical Checks
- [ ] No reentrancy vulnerabilities (ReentrancyGuard used)
- [ ] CEI pattern followed (Check-Effects-Interactions)
- [ ] No integer overflow/underflow (Solidity 0.8.x)
- [ ] Access control properly implemented (Ownable, AccessControl)
- [ ] No front-running vulnerabilities (commit-reveal where needed)

## Oracle Security
- [ ] Multi-source oracle aggregation
- [ ] Dispute mechanism implemented (UMA)
- [ ] Price manipulation detection
- [ ] Staleness checks on price feeds

## Economic Security
- [ ] Kelly Criterion implemented correctly
- [ ] Position limits enforced
- [ ] Liquidation thresholds safe
- [ ] No infinite mint exploits

## Gas Optimization
- [ ] No unbounded loops
- [ ] Storage vs memory usage optimized
- [ ] Struct packing applied
- [ ] Custom errors instead of strings
```

**API Security**:
```typescript
// src/lib/api/security.ts
import rateLimit from 'express-rate-limit'
import { body, param, validationResult } from 'express-validator'
import { verifyAuthToken } from './auth-middleware'

// Rate limiting
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // 100 requests per window
  message: 'Too many requests'
})

export const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,  // 10 trades per minute
  message: 'Trade limit exceeded'
})

// Input validation middleware
export const validateBuyShares = [
  body('marketId').isString().trim().escape(),
  body('outcome').isInt({ min: 0, max: 1 }),
  body('shares').isFloat({ min: 0.01, max: 10000 }),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    next()
  }
]

// CORS configuration
export const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

**Estimated Time**: 10-12 days

---

### Week 18-19: Deployment & Monitoring

#### Task 4.3: Deployment Infrastructure

**Docker Setup**:
```dockerfile
# Dockerfile
FROM oven/bun:latest

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN bun run build

# Expose ports
EXPOSE 3000

# Start
CMD ["bun", "run", "start"]
```

**Docker Compose** (development):
```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/babylon
      - REDIS_URL=redis://redis:6379
      - BASE_RPC_URL=${BASE_RPC_URL}
      - PRIVY_APP_ID=${PRIVY_APP_ID}
    depends_on:
      - db
      - redis

  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=babylon
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  a2a-server:
    build:
      context: .
      dockerfile: Dockerfile.a2a
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/babylon
      - IDENTITY_REGISTRY_ADDRESS=${IDENTITY_REGISTRY_ADDRESS}
    depends_on:
      - db

  game-daemon:
    build:
      context: .
      dockerfile: Dockerfile.daemon
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/babylon
      - GROQ_API_KEY=${GROQ_API_KEY}
    depends_on:
      - db

volumes:
  postgres_data:
```

**Kubernetes** (production):
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: babylon-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: babylon
  template:
    metadata:
      labels:
        app: babylon
    spec:
      containers:
      - name: app
        image: babylon:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: babylon-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: babylon-service
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
  selector:
    app: babylon
```

#### Task 4.4: Monitoring & Observability

**Prometheus + Grafana**:
```typescript
// src/lib/monitoring/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client'

// HTTP request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
})

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
})

// Trading metrics
export const tradesTotal = new Counter({
  name: 'trades_total',
  help: 'Total number of trades executed',
  labelNames: ['market_type', 'outcome']
})

export const tradingVolume = new Counter({
  name: 'trading_volume_total',
  help: 'Total trading volume in USDC',
  labelNames: ['market_type']
})

export const activePositions = new Gauge({
  name: 'active_positions',
  help: 'Number of active positions',
  labelNames: ['market_type']
})

// Agent metrics
export const activeAgents = new Gauge({
  name: 'active_agents',
  help: 'Number of active AI agents'
})

export const agentDecisions = new Counter({
  name: 'agent_decisions_total',
  help: 'Total number of agent decisions',
  labelNames: ['agent_id', 'decision_type']
})

// Game engine metrics
export const gameTickDuration = new Histogram({
  name: 'game_tick_duration_seconds',
  help: 'Duration of game engine ticks',
  buckets: [1, 5, 10, 30, 60]
})

export const postsGenerated = new Counter({
  name: 'posts_generated_total',
  help: 'Total number of posts generated'
})

// Blockchain metrics
export const blockchainTransactions = new Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['type', 'status']
})

export const gasUsed = new Counter({
  name: 'gas_used_total',
  help: 'Total gas used in wei',
  labelNames: ['contract']
})

// Metrics endpoint
export function getMetrics(): string {
  return register.metrics()
}
```

**Middleware for metrics**:
```typescript
// src/lib/monitoring/middleware.ts
import { httpRequestDuration, httpRequestTotal } from './metrics'

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000

    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode
      },
      duration
    )

    httpRequestTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode
    })
  })

  next()
}
```

**Sentry Error Tracking**:
```typescript
// src/lib/monitoring/sentry.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
})

export function captureException(error: Error, context?: any) {
  Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra
  })
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level)
}
```

**Health Check Endpoints**:
```typescript
// src/app/api/health/route.ts
export async function GET() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkBlockchain(),
    checkGameEngine()
  ])

  const healthy = checks.every(c => c.status === 'fulfilled')

  return Response.json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks: {
      database: checks[0].status,
      redis: checks[1].status,
      blockchain: checks[2].status,
      gameEngine: checks[3].status
    },
    timestamp: Date.now()
  }, { status: healthy ? 200 : 503 })
}

async function checkDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}

async function checkBlockchain(): Promise<void> {
  const blockNumber = await publicClient.getBlockNumber()
  if (!blockNumber) throw new Error('Blockchain unavailable')
}
```

**Estimated Time**: 8-10 days

---

### Phase 4 Deliverables

**✅ Testing**:
- ≥80% unit test coverage
- ≥70% integration coverage
- E2E tests with Synpress
- Performance benchmarks
- Load testing results

**✅ Security**:
- Smart contract audit complete
- Security vulnerability fixes
- Penetration testing
- OWASP compliance

**✅ Infrastructure**:
- Docker containerization
- Kubernetes manifests
- CI/CD pipeline (GitHub Actions)
- Blue-green deployment

**✅ Monitoring**:
- Prometheus + Grafana dashboards
- Sentry error tracking
- Health check endpoints
- Alert configuration

**✅ Documentation**:
- Deployment guide
- API documentation
- Security audit report
- Runbook for operations

---

## Security & Auditing

### Smart Contract Audit Preparation

**Pre-Audit Checklist**:
1. ✅ All contracts follow OpenZeppelin patterns
2. ✅ Comprehensive test coverage (≥80%)
3. ✅ Slither static analysis clean
4. ✅ Mythril security scanner clean
5. ✅ No TODO/FIXME comments in production code
6. ✅ NatSpec documentation complete
7. ✅ Gas optimization report generated

**Audit Firms** (recommended):
- **Trail of Bits**: $50k-$100k, 4-6 weeks
- **Spearbit**: $30k-$80k, 3-4 weeks
- **Code4rena**: $20k-$50k, 2-3 weeks (competitive)

**Audit Scope**:
- BabylonHub (Diamond proxy)
- PredictionMarketFacet
- PerpetualsFacet
- IdentityRegistry (ERC-8004)
- ReputationRegistry
- Oracle adapters
- Token contracts

### Security Best Practices

**Smart Contract Security**:
```solidity
// ✅ GOOD: CEI pattern + ReentrancyGuard
function withdrawWinnings(bytes32 marketId) external nonReentrant {
    // Check
    require(market.resolved, "Not resolved");
    uint256 winnings = calculateWinnings(msg.sender, marketId);
    require(winnings > 0, "No winnings");

    // Effects
    positions[msg.sender][marketId].withdrawn = true;

    // Interactions
    (bool success, ) = msg.sender.call{value: winnings}("");
    require(success, "Transfer failed");
}

// ❌ BAD: Reentrancy vulnerable
function withdrawWinnings(bytes32 marketId) external {
    uint256 winnings = calculateWinnings(msg.sender, marketId);
    (bool success, ) = msg.sender.call{value: winnings}("");  // Interaction before effects
    positions[msg.sender][marketId].withdrawn = true;  // Too late!
}
```

**API Security**:
- Rate limiting: 100 req/15min (general), 10 req/min (trading)
- Input validation: Zod schemas on all endpoints
- SQL injection: Parameterized queries only (Prisma)
- XSS prevention: Content Security Policy headers
- CSRF protection: SameSite cookies

**Agent Security**:
- Prompt injection: Input sanitization
- Wallet security: MPC wallets, no private key exposure
- Rate limiting: Per-agent limits
- Sybil resistance: ERC-8004 + reputation

---

## Testing Strategy

### Testing Pyramid

```
      /\
     /  \
    / E2E \     ← 10% (Synpress, wallet interactions)
   /______\
  /        \
 /Integration\  ← 20% (Hardhat, API tests)
/____________\
/            \
/  Unit Tests \ ← 70% (Foundry, Jest, Vitest)
/______________\
```

### Coverage Targets

**Smart Contracts**:
- Unit: ≥80% (Foundry)
- Integration: ≥70% (Hardhat)
- Gas benchmarks: All functions

**Backend**:
- Unit: ≥75% (Vitest)
- Integration: ≥65% (Supertest)
- API: All endpoints

**Frontend**:
- Component: ≥60% (React Testing Library)
- E2E: Critical user paths (Synpress)

### Test Commands

```bash
# Smart contracts
forge test --gas-report               # Unit tests + gas
npx hardhat test                      # Integration tests
forge coverage                        # Coverage report

# Backend
bun test                              # Unit + integration
bun test:watch                        # Watch mode

# Frontend
bun test:components                   # Component tests
bun test:e2e                          # Synpress E2E

# All
bun test:all                          # Run everything
```

---

## Deployment Plan

### Deployment Stages

**Stage 1: Testnet (Base Sepolia)**
- Deploy all contracts
- Test with virtual tokens
- Limited user group (50 beta testers)
- Duration: 2 weeks

**Stage 2: Mainnet Soft Launch (Base)**
- Deploy to Base mainnet
- Limited real funds ($10k pool)
- Invite-only access (200 users)
- Monitor closely for issues
- Duration: 4 weeks

**Stage 3: Public Launch**
- Remove invite requirement
- Increase liquidity pools
- Marketing campaign
- Full monitoring active

### Deployment Checklist

**Pre-Deployment**:
- [ ] All tests passing
- [ ] Security audit complete
- [ ] Gas optimization verified
- [ ] Contracts verified on Basescan
- [ ] Oracles configured
- [ ] Monitoring dashboards live
- [ ] Runbook prepared
- [ ] Rollback plan ready

**Post-Deployment**:
- [ ] Contract addresses documented
- [ ] Frontend updated with addresses
- [ ] Health checks passing
- [ ] Monitoring alerts configured
- [ ] Documentation published
- [ ] Community announcement

### Rollback Plan

**Contract Issues**:
1. Pause affected facet (Diamond Standard)
2. Notify users via frontend banner
3. Fix issue in new facet
4. Deploy replacement facet
5. Diamond cut to swap facets
6. Unpause

**Critical Bugs**:
1. Emergency pause all trading
2. Snapshot current state
3. Deploy fixed contracts
4. Migrate user positions
5. Resume with compensation if needed

---

## Success Metrics

### Phase 1: Blockchain (Week 6)
- ✅ All contracts deployed to Base mainnet
- ✅ ≥80% test coverage
- ✅ Gas costs <$0.05 per trade
- ✅ Successful audit (no critical issues)
- ✅ Hybrid settlement working

### Phase 2: A2A Protocol (Week 10)
- ✅ WebSocket server stable (99.9% uptime)
- ✅ 100+ agents can connect
- ✅ <100ms message routing latency
- ✅ x402 micropayments functional
- ✅ ERC-8004 registry operational

### Phase 3: AI Agents (Week 15)
- ✅ 10+ diverse agent strategies
- ✅ Multi-agent simulations passing
- ✅ Learning system functional
- ✅ Coalition formation working
- ✅ <5s decision latency

### Phase 4: Production (Week 19)
- ✅ ≥80% overall test coverage
- ✅ Security audit passed
- ✅ Deployment pipeline working
- ✅ Monitoring live
- ✅ Documentation complete

### Post-Launch (3 months)
- 1,000+ active users
- 10,000+ trades executed
- 50+ AI agents participating
- 99.5% uptime
- <500ms average API response time
- $100k+ trading volume

---

## Risk Mitigation

### Technical Risks

**Risk**: Smart contract vulnerability
**Mitigation**: Comprehensive audit + bug bounty + insurance
**Contingency**: Emergency pause + rollback plan

**Risk**: Oracle manipulation
**Mitigation**: Multi-source oracles + UMA disputes + bounds checking
**Contingency**: Manual resolution + user refunds

**Risk**: Agent DDoS attack
**Mitigation**: Rate limiting + ERC-8004 registration + reputation filtering
**Contingency**: Temporary agent pause + IP blocking

**Risk**: Blockchain congestion
**Mitigation**: L2 deployment (Base) + gas optimization + batch operations
**Contingency**: Queue transactions + increase gas limit

### Business Risks

**Risk**: Low user adoption
**Mitigation**: Strong marketing + influencer partnerships + rewards program
**Contingency**: Pivot to B2B (agent marketplace)

**Risk**: Regulatory scrutiny
**Mitigation**: Legal review + KYC options + geographic restrictions
**Contingency**: Implement compliance layer + exit plan

**Risk**: Market manipulation
**Mitigation**: Position limits + anomaly detection + reputation system
**Contingency**: Market maker intervention + suspicious account freezing

### Operational Risks

**Risk**: Key team member leaves
**Mitigation**: Knowledge documentation + cross-training + backup maintainers
**Contingency**: Hire replacement + community takeover plan

**Risk**: Infrastructure outage
**Mitigation**: Multi-region deployment + automatic failover + 99.9% SLA
**Contingency**: Status page + user communication + downtime compensation

---

## Budget Estimate

### Development Costs

**Phase 1** (Blockchain):
- Smart contract development: 2 devs × 6 weeks = $30k
- Audit: $50k
- Testing: $10k
- **Total**: $90k

**Phase 2** (A2A):
- Protocol development: 1 dev × 4 weeks = $15k
- Infrastructure: $5k
- **Total**: $20k

**Phase 3** (AI Agents):
- Agent framework: 2 devs × 5 weeks = $30k
- LLM API costs: $2k/month
- Vector database: $200/month
- **Total**: $32k

**Phase 4** (Production):
- DevOps: 1 engineer × 4 weeks = $15k
- Security testing: $10k
- Documentation: $5k
- **Total**: $30k

### Operational Costs (Monthly)

- Infrastructure: $2,000 (AWS/GCP)
- LLM APIs: $3,000 (OpenAI/Anthropic)
- Blockchain gas: $1,000 (Base L2)
- Monitoring: $500 (Sentry, Datadog)
- **Total**: $6,500/month

### Total Budget

**Development**: $172,000
**Operations** (first year): $78,000
**Total Year 1**: $250,000

---

## Timeline Summary

| Week | Phase | Key Deliverables | Team |
|------|-------|------------------|------|
| 1-2 | Phase 1 | Smart contracts | 2 devs |
| 3-4 | Phase 1 | Oracle integration | 2 devs |
| 5-6 | Phase 1 | Frontend integration | 2 devs |
| 7-8 | Phase 2 | A2A protocol | 1 dev |
| 9-10 | Phase 2 | Discovery + x402 | 1 dev |
| 11-12 | Phase 3 | Agent framework | 2 devs |
| 13-14 | Phase 3 | Multi-agent system | 2 devs |
| 15 | Phase 3 | Testing & simulation | 2 devs |
| 16-17 | Phase 4 | Security audit | 2 devs |
| 18-19 | Phase 4 | Deployment & monitoring | 1 DevOps |
| **Total** | **19 weeks** | **Production ready** | **2-3 team** |

---

## Next Steps

### Immediate Actions (This Week)

1. **Review this PLAN.md** with the team
2. **Set up project board** (GitHub Projects or Jira)
3. **Create task tickets** for Phase 1
4. **Assign team members** to initial tasks
5. **Set up development environment** (if not done)
6. **Schedule weekly standups**

### Week 1 Kickoff

**Day 1-2**:
- Team meeting: Review architecture
- Set up smart contract repo structure
- Initialize Hardhat + Foundry projects
- Write first contract tests

**Day 3-4**:
- Implement PredictionMarketFacet (MVP)
- Write comprehensive unit tests
- Gas optimization analysis
- Code review

**Day 5**:
- Deploy to local testnet
- Integration testing
- Document progress
- Plan Week 2

### Success Tracking

**Daily**:
- Standup (15 min)
- Update task board
- Push code to GitHub

**Weekly**:
- Demo completed features
- Review metrics vs targets
- Adjust timeline if needed
- Document learnings

**Monthly**:
- Stakeholder presentation
- Budget review
- Risk assessment update
- Celebrate wins 🎉

---

## Conclusion

This plan provides a comprehensive roadmap to transform Babylon from a 70%-complete game engine into a production-ready prediction market platform with full blockchain integration, autonomous AI agents, and agent-to-agent communication.

**Key Strengths**:
- ✅ Solid foundation (70% complete)
- ✅ Research-backed decisions (6 comprehensive reports)
- ✅ Realistic timeline (19 weeks)
- ✅ Clear milestones and deliverables
- ✅ Risk mitigation strategies

**Critical Path**:
1. Blockchain contracts (blocking A2A + agents)
2. A2A protocol (blocking agents)
3. AI agents (final integration)
4. Production readiness (polish)

**Launch Date**: Q1 2026 (March-April)

---

*This document is a living plan and will be updated as development progresses.*

**Version**: 2.0
**Last Updated**: October 29, 2025
**Next Review**: November 5, 2025
