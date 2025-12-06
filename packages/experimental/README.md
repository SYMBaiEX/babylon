# @babylon/experimental

**100% Permissionless AI Game Infrastructure**

No API keys. No logins. Wallet signature only.

## Overview

This package provides a fully decentralized infrastructure for running AI games:

- **Storage**: Arweave (permanent, wallet-signed via Irys)
- **Encryption**: AES-256-GCM (Web Crypto API)
- **Signatures**: secp256k1 (Ethereum-compatible)
- **TEE**: Marlin Oyster (AWS Nitro Enclaves on Arbitrum)
- **Contracts**: Solidity (Foundry)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- A funded Ethereum wallet (private key)
- For TEE: USDC on Arbitrum One

### 1. Install Dependencies

```bash
cd packages/experimental
bun install
```

### 2. Set Environment Variables

```bash
# In the repo root .env file
PRIVATE_KEY=0x...  # Your wallet private key
# or
DEPLOYER_PRIVATE_KEY=0x...
```

### 3. Run the Demo

```bash
# Source env and run demo
source ../../.env
PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY bun run demo:bun
```

This will:
1. ✅ Test Arweave gateway connectivity
2. ✅ Verify wallet signatures (secp256k1)
3. ✅ Test TEE crypto operations
4. ✅ Verify AES-256-GCM encryption
5. ✅ Test tamper detection
6. ✅ Upload encrypted state to Arweave
7. ✅ Run game loop with on-chain state
8. ✅ Verify TEE infrastructure on Arbitrum

## Available Commands

```bash
# Run the full demo
bun run demo:bun

# Run permissionless audit
bun run audit

# Test Marlin TEE infrastructure
bun run tee:test
bun run tee:e2e

# Check wallet balances
bun run check:wallets

# Run unit tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

## TEE (Marlin Oyster)

Marlin Oyster provides 100% permissionless TEE on Arbitrum:

### Requirements

- ETH on Arbitrum (for gas) ~0.01 ETH
- USDC on Arbitrum (for compute) ~10 USDC

### How It Works

1. **Upload worker code to Arweave** (permanent storage)
2. **Compute code hash** (SHA-256)
3. **Run operator** (on TEE hardware):
   ```bash
   ./oyster-serverless --signer $KEY --rpc https://arb1.arbitrum.io/rpc
   ```
4. **Submit jobs** via contract:
   ```typescript
   const result = await marlinClient.startJob(codeHash, inputs);
   ```
5. **Execution** in AWS Nitro Enclave
6. **Attestation** returned on-chain

### Contracts (Arbitrum One)

| Contract | Address |
|----------|---------|
| Subscription Relay | `0x8Fb2C621d6E636063F0E49828f4Da7748135F3cB` |
| Relay | `0xD28179711eeCe385bc2096c5D199E15e6415A4f5` |
| USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |

## Storage (Arweave)

All data is permanently stored on Arweave via Irys:

```typescript
import { createDevnetStorage } from '@babylon/experimental';

const storage = createDevnetStorage(privateKey);
const result = await storage.uploadJSON({ data: 'test' });
console.log(result.url); // https://arweave.net/...
```

- **Devnet**: Free (no tokens needed)
- **Mainnet**: Pay with ETH (wallet signature)

## Encryption

AES-256-GCM with hardware-derived keys:

```typescript
import { TEEEnclave } from '@babylon/experimental';

const enclave = await TEEEnclave.create({ codeHash, instanceId });
const { hash } = await enclave.encryptState(secretData);
const decrypted = await enclave.decryptState(sealed);
```

## Smart Contracts (Foundry)

Build and test Solidity contracts:

```bash
# Build
forge build

# Test
forge test

# Deploy
forge script script/Counter.s.sol:CounterScript \
  --rpc-url <rpc_url> \
  --private-key <key>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PERMISSIONLESS STACK                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Arweave   │  │   Marlin    │  │      Arbitrum       │  │
│  │  (Storage)  │  │   (TEE)     │  │    (Contracts)      │  │
│  │             │  │             │  │                     │  │
│  │ • Permanent │  │ • Nitro     │  │ • Subscription      │  │
│  │ • Wallet    │  │ • Wallet    │  │ • Relay             │  │
│  │   signed    │  │   + USDC    │  │ • USDC payments     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│              ┌─────────────────────┐                        │
│              │     Your Wallet     │                        │
│              │  (Only Credential)  │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## Verification

Run the permissionless audit:

```bash
bun run audit
```

Expected output:
```
PERMISSIONLESS: 11/11 (100%)

✅ 100% PERMISSIONLESS - NO BLOCKERS

NO API KEYS ANYWHERE. WALLET IS YOUR ONLY CREDENTIAL.
```

## License

MIT
