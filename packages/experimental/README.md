# @babylon/experimental

**Permissionless AI Compute Marketplace**

A decentralized compute marketplace built on ERC-8004 for AI inference. No API keys - only wallet signatures.

## 🎯 Goals

1. **100% Permissionless** - No API keys, no logins, only wallet signatures
2. **Decentralized Registry** - Providers register via ERC-8004 on-chain
3. **Hardware Attestation** - Cryptographic proof of GPU/TEE capabilities
4. **Stake-based Security** - Users and providers stake for accountability
5. **Open Gateway** - Any gateway can route to any provider

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER / GAME CLIENT                        │
│                    (Wallet-based authentication)                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                           GATEWAY                                │
│   Provider Discovery → Request Router → Response Verifier        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   COMPUTE NODE  │  │   COMPUTE NODE  │  │   COMPUTE NODE  │
│   (Local Demo)  │  │   (Phala TEE)   │  │   (GPU Server)  │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BLOCKCHAIN LAYER                           │
│   Provider Registry (ERC-8004) | Staking | Escrow | Reputation   │
│                                                                  │
│   Chains: Anvil (local) → Base Sepolia → Base Mainnet            │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Components

### Smart Contracts

- **BabylonRegistry** - ERC-8004 extension for compute providers
- **ComputeStaking** - User and provider stake management
- **InferenceEscrow** - Payment escrow for inference jobs
- **ModerationMarket** - Dispute resolution and reporting

### Compute Node

Providers run nodes that:
- Detect and attest hardware (GPU/TEE)
- Serve OpenAI-compatible inference
- Generate cryptographic attestations
- Register on-chain via ERC-8004

### Gateway

Routes requests from clients to providers:
- Discovers providers via ERC-8004
- Routes based on requirements (model, latency, price)
- Verifies responses and attestations
- Reports reputation metrics

## 🚀 Quick Start

### Prerequisites

- Bun 1.0+
- Wallet with testnet ETH (Base Sepolia)
- Docker (for node deployment)

### Run Demo

```bash
# Install dependencies
bun install

# Run automated demo on Anvil
bun run demo:bun

# Run permissionless audit
bun run audit
```

### Run Tests

```bash
bun run test
```

## 📚 Documentation

- [Architecture Overview](./docs/PERMISSIONLESS_COMPUTE.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)
- [ERC-8004 Specification](./docs/erc8004.md)

## 🔐 Security Model

### Staking Requirements

| Role | Minimum Stake | Purpose |
|------|---------------|---------|
| Provider | 0.1 ETH | Accountable for service quality |
| User | 0.01 ETH | Prevent spam/abuse |

### Trust Models

1. **Reputation** - ERC-8004 feedback from users
2. **Attestation** - Hardware verification (TEE/GPU)
3. **Staking** - Economic security via slashing

### Moderation

- Report submission with stake
- Guardian voting on disputes
- Slashing for proven misbehavior

## 🖥️ Supported Hardware

| Platform | TEE Type | Status |
|----------|----------|--------|
| Intel TDX | Hardware | Production |
| NVIDIA H100/H200 | GPU TEE | Production |
| Apple MLX | Secure Enclave | Beta |
| Simulated | None | Testing only |

## 📁 Project Structure

```
packages/experimental/
├── src/
│   ├── node/           # Compute node implementation
│   ├── gateway/        # Request routing gateway
│   ├── attestation/    # Hardware attestation
│   ├── storage/        # Arweave storage
│   ├── tee/            # TEE abstractions
│   ├── infra/          # Blockchain clients
│   └── tests/          # Test suites
├── docs/
│   ├── PERMISSIONLESS_COMPUTE.md
│   └── IMPLEMENTATION_PLAN.md
└── docker/             # Docker containers
```

## 🔗 Related Projects

- [ERC-8004](https://github.com/ethereum/EIPs) - Trustless Agents standard
- [Agent0 SDK](https://github.com/agent0lab/agent0-ts) - ERC-8004 TypeScript SDK
- [Arweave](https://www.arweave.org/) - Permanent storage
- [DStack](https://github.com/phala-network/dstack) - TEE framework

## 📄 License

MIT
