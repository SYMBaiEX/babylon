# Permissionless AI Game - Experimental Implementation

A toy demonstration of the permissionless AI game infrastructure described in `task.md`.

## Quick Start

```bash
# Install
bun install

# Run demo (simulated environment)
bun run demo

# Run tests
bun test
```

## What's Implemented vs What's Needed

### ✅ Production-Quality (Real Crypto, Real Logic)

| Component | Description |
|-----------|-------------|
| **AES-256-GCM Encryption** | Real authenticated encryption via Web Crypto API |
| **HKDF Key Derivation** | Real key derivation per RFC 5869 |
| **Key Rotation** | Real re-encryption on rotation |
| **AI Agent** | Real neural network with backpropagation |
| **Game Logic** | Real pattern prediction game |
| **State Management** | Real encrypted checkpoint system |
| **Contract Logic** | Complete state machine for treasury/governance |

### 🔶 Simulated (Needs Real Integration)

| Component | Current | What's Needed |
|-----------|---------|---------------|
| **TEE Runtime** | Simulated enclave | Deploy to Phala Network CVM |
| **Blockchain** | Mock state machine | Deploy `contracts/GameTreasury.sol` to EVM |
| **IPFS** | In-memory simulator | Connect to real IPFS node |
| **Attestation** | Fake signatures | Use Phala DStack SDK for real Intel/NVIDIA attestation |
| **Wallet** | Simulated viem accounts | Use real DStack-derived keys |

## Making It Fully Permissionless

### Step 1: Deploy the Contract

```bash
# Using Hardhat
cd contracts
npx hardhat deploy --network sepolia

# Or Forge
forge create GameTreasury --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

### Step 2: Fund the Treasury

```typescript
// Anyone can deposit
const tx = await contract.deposit({ value: parseEther("1.0") });
```

### Step 3: Deploy to Phala TEE

```bash
# Package as Docker container
docker build -t babylon-game .

# Deploy to Phala Cloud (uses wallet for auth, not API keys)
phala deploy --image babylon-game --wallet $WALLET_ADDRESS
```

### Step 4: Bootstrap the Game

```bash
# With real infrastructure
PRIVATE_KEY=0x... \
CONTRACT_ADDRESS=0x... \
RPC_URL=https://... \
bun run src/infra/bootstrap.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PERMISSIONLESS LAYER                        │
├─────────────────────────────────────────────────────────────────┤
│  Anyone can:                                                    │
│  • Fund the treasury (deposit ETH)                             │
│  • Run a TEE operator node (if they have hardware)             │
│  • Take over if current operator goes offline                  │
│  • Vote on governance (with 30-day staked tokens)              │
│  • Verify attestation and game state                           │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   GameTreasury  │  │   TEE Enclave   │  │      IPFS       │
│   (Solidity)    │  │  (Phala CVM)    │  │   (Filecoin)    │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • Holds funds   │  │ • AI inference  │  │ • Encrypted     │
│ • State anchor  │  │ • Training loop │  │   game state    │
│ • Operator auth │  │ • Key mgmt      │  │ • Public        │
│ • Rate limits   │  │ • Attestation   │  │   training data │
│ • Governance    │  │ • Heartbeat     │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## What Makes It Permissionless?

### 1. No API Keys
- Phala Cloud uses wallet signatures for deployment
- Contract interactions use wallet signatures
- IPFS is content-addressed (no accounts)

### 2. No Single Operator
- Any TEE with valid attestation can become operator
- If operator fails, anyone can take over after timeout
- Treasury funds are rate-limited (can't be drained)

### 3. No Central Server
- Game runs in decentralized TEE network
- State is on decentralized storage
- Coordination is on blockchain

### 4. Verifiable Everything
- Code integrity via attestation
- State integrity via content-addressing
- Financial integrity via smart contracts

## Remaining Work for Full Permissionlessness

1. **Phala DStack Integration**
   - Replace simulated attestation with real Intel TDX quotes
   - Use DStack SDK for key derivation inside enclave
   - Deploy to actual H200 GPU TEE

2. **Contract Deployment**
   - Deploy `GameTreasury.sol` to mainnet/L2
   - Set up council multi-sig
   - Fund initial treasury

3. **IPFS Pinning**
   - Set up Filecoin deals for persistence
   - Or use Arweave for permanent storage

4. **Governance Token**
   - Deploy ERC-20 with 30-day lock for voting
   - Integrate with DAO contract

## Cost Estimates

| Resource | Cost/Month |
|----------|------------|
| H200 GPU TEE | ~$3,000 |
| IPFS/Filecoin storage | ~$10 |
| Ethereum transactions | ~$100 |
| **Total** | **~$3,110/month** |

## Security Model

- **TEE Compromise**: Key rotation limits damage to one time window
- **Operator Malice**: Rate limits prevent fund theft; attestation prevents code tampering
- **Council Compromise**: Council can only rotate keys, not access funds
- **Contract Bug**: Pausable by council; upgradeable by DAO

## Files

```
packages/experimental/
├── contracts/
│   └── GameTreasury.sol      # Solidity contract (deploy this)
├── src/
│   ├── crypto/               # Real AES-GCM, HKDF
│   ├── tee/                  # Simulated TEE enclave
│   ├── contracts/            # Mock blockchain logic
│   ├── storage/              # IPFS simulator + state manager
│   ├── game/                 # AI agent + game environment
│   ├── orchestrator/         # System coordinator
│   ├── infra/                # Real blockchain/IPFS clients
│   └── tests/                # 344 tests
├── task.md                   # Original design document
└── README.md                 # This file
```

## Commands

```bash
bun run demo      # Run full demonstration
bun test          # Run all 344 tests
bun run typecheck # TypeScript checks
bun run lint      # Biome linting
bun run build     # Compile TypeScript
```
