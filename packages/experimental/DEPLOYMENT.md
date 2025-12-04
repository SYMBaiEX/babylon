# Deployment Guide: Real Infrastructure Smoke Test

Deploy, verify, and shut down quickly to minimize costs.

## Cost Breakdown

| Resource | One-Time Cost | Ongoing Cost | Smoke Test Cost |
|----------|---------------|--------------|-----------------|
| **Sepolia ETH** | Free (faucet) | Free | **$0** |
| **Contract Deploy** | ~0.01 ETH gas | - | **$0** (testnet) |
| **Phala TEE (H200)** | - | ~$4/hour | **~$2** (30 min test) |
| **Arweave Storage** | ~$0.005/KB | - | **~$0.05** (10KB test) |
| **Total Smoke Test** | | | **~$2.05** |

### For Mainnet Production

| Resource | Setup | Monthly |
|----------|-------|---------|
| Mainnet deploy | ~$50 gas | - |
| Phala H200 | - | ~$3,000 |
| Arweave (100MB/mo) | ~$5 | $5 |
| **Total** | **~$55** | **~$3,005** |

## Prerequisites

```bash
# 1. Install tools
bun install
npm install -g @foundry-rs/foundry  # For contract deployment

# 2. Get testnet ETH
# Sepolia faucet: https://sepoliafaucet.com/

# 3. Get AR tokens for Arweave (optional - can use free tier initially)
# Buy AR on any exchange, or use Bundlr credit card

# 4. Get PHA tokens for Phala (if not using free tier)
# Available on major exchanges
```

## Permissionless Storage: Arweave

Arweave is truly permissionless - pay AR tokens, data is stored forever.

```typescript
// No API keys needed - just sign with wallet
import Arweave from 'arweave';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
});

// Upload data - permissionless!
const tx = await arweave.createTransaction({ data: 'Hello World' });
await arweave.transactions.sign(tx, wallet);  // wallet = JWK
await arweave.transactions.post(tx);
```

Alternative: **Bundlr** (now **Irys**) - cheaper, faster, same permanence:
```typescript
import Irys from '@irys/sdk';

const irys = new Irys({
  url: 'https://node1.irys.xyz',
  token: 'ethereum',  // Pay with ETH!
  key: privateKey     // Your ETH private key
});

const receipt = await irys.upload('Hello World');
console.log(`Stored at: https://arweave.net/${receipt.id}`);
```

## Step-by-Step Smoke Test

### Step 1: Set Environment Variables

```bash
# Create .env.local
cat > .env.local << 'EOF'
# Your wallet (with Sepolia ETH)
PRIVATE_KEY=0x...your_private_key...

# RPC (free from Alchemy/Infura or use public)
RPC_URL=https://rpc.sepolia.org

# Will be set after contract deploy
CONTRACT_ADDRESS=

# Phala (get from phala.network dashboard)
PHALA_API_KEY=  # Optional - can use wallet auth
EOF
```

### Step 2: Deploy Contract to Sepolia

```bash
cd packages/experimental

# Using Foundry
forge create contracts/GameTreasury.sol:GameTreasury \
  --constructor-args 1000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key $PRIVATE_KEY \
  --verify

# Save the deployed address
export CONTRACT_ADDRESS=0x...deployed_address...
```

### Step 3: Fund the Contract

```bash
# Send 0.1 Sepolia ETH to the contract
cast send $CONTRACT_ADDRESS "deposit()" \
  --value 0.1ether \
  --rpc-url https://rpc.sepolia.org \
  --private-key $PRIVATE_KEY

# Verify
cast call $CONTRACT_ADDRESS "getBalance()" --rpc-url https://rpc.sepolia.org
```

### Step 4: Deploy to Phala TEE

```bash
# Option A: Phala Cloud UI
# 1. Go to https://cloud.phala.network
# 2. Connect wallet
# 3. Deploy Docker image

# Option B: CLI (when available)
phala deploy \
  --image ghcr.io/babylon/ai-game:latest \
  --env PRIVATE_KEY=$PRIVATE_KEY \
  --env CONTRACT_ADDRESS=$CONTRACT_ADDRESS \
  --env RPC_URL=$RPC_URL
```

### Step 5: Run Smoke Test

```bash
# Run the verification script
bun run src/infra/smoke-test.ts
```

### Step 6: Shut Down (Important!)

```bash
# Stop Phala deployment to avoid charges
phala stop --deployment-id $DEPLOYMENT_ID

# Or via UI: cloud.phala.network -> Stop
```

## Smoke Test Script

Run the smoke test to verify everything works:

```bash
PRIVATE_KEY=0x... \
CONTRACT_ADDRESS=0x... \
RPC_URL=https://rpc.sepolia.org \
bun run src/infra/smoke-test.ts
```

## Permissionless Storage Options

### Option 1: Irys (Recommended)
- Pay with ETH, store on Arweave permanently
- Free devnet for testing
- No API keys - just your wallet

```bash
bun add @irys/sdk
```

```typescript
import Irys from '@irys/sdk';

const irys = new Irys({
  url: 'https://devnet.irys.xyz',  // Free for testing
  token: 'ethereum',
  key: process.env.PRIVATE_KEY,
});

// Upload - truly permissionless!
const receipt = await irys.upload(data);
console.log(`https://arweave.net/${receipt.id}`);
```

### Option 2: Web3.Storage (Storacha)
- Free tier available
- Wallet-based auth
- IPFS + Filecoin backend

### Option 3: Run Your Own IPFS Node
- Fully permissionless
- Need to ensure pinning

## Full Production Setup

For mainnet production, you need:

1. **~$50 ETH** - Contract deployment + initial ops
2. **~$3,000/month** - Phala H200 GPU TEE
3. **~$5/month** - Arweave storage
4. **5 council members** - Multi-sig for key rotation

## Quick Commands Summary

```bash
# Deploy contract
forge create contracts/GameTreasury.sol:GameTreasury \
  --constructor-args "1000000000000000000" \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Fund treasury
cast send $CONTRACT "deposit()" --value 0.5ether \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Run smoke test
bun run src/infra/smoke-test.ts

# Deploy to Phala (when ready)
phala deploy --image babylon/ai-game --wallet $WALLET

# Shutdown Phala (important!)
phala stop --deployment-id $ID
```

