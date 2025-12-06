# ENS + IPFS Permissionless Frontend Deployment

## Overview

This guide explains how to deploy the Babylon Trust Dashboard to IPFS and make it accessible via an ENS domain (e.g., `babylon-game.eth`).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER BROWSER                                 │
│                                                                 │
│  1. Visit: babylon-game.eth.limo                               │
│     OR: babylon-game.eth.link                                  │
│     OR: babylon-game.eth (ENS-aware browser)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  eth.limo GATEWAY                               │
│                                                                 │
│  2. Resolves ENS name → gets contenthash                       │
│     contenthash: ipfs://QmXxx...                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IPFS NETWORK                                 │
│                                                                 │
│  3. Fetches files from CID                                     │
│     index.html, app.js, styles.css, etc.                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRUST DASHBOARD                                 │
│                                                                 │
│  4. Static frontend runs in browser                            │
│     - Verifies TEE attestation                                 │
│     - Checks on-chain state                                    │
│     - Validates commit-reveal                                  │
│     - NO BACKEND REQUIRED                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Components Created

### 1. Frontend (`frontend/index.html`)

A fully static, self-contained HTML file that:
- Displays TEE attestation status
- Shows on-chain state (contract address, state CID, treasury)
- Lists commit-reveal log
- Allows verification of encrypted data
- Works with NO server - pure client-side JavaScript

### 2. ENS Deployer (`src/infra/ens-deployer.ts`)

TypeScript module that:
- Uploads frontend to IPFS (via Pinata or local node)
- Sets ENS contenthash to point to IPFS CID
- Generates recovery plans
- Verifies deployment accessibility

## Deployment Steps

### Prerequisites

1. **Own an ENS name**: Register at [app.ens.domains](https://app.ens.domains)
2. **Set a resolver**: Must have a Public Resolver set
3. **Have ETH for gas**: ~0.01 ETH for the contenthash transaction
4. **IPFS pinning** (optional but recommended): Pinata, Infura, or local node

### Option A: Deploy with Pinata (Recommended)

```bash
# Set environment variables
export PRIVATE_KEY=0x...your_wallet_private_key
export ENS_NAME=your-name.eth
export NETWORK=mainnet  # or sepolia for testing
export PINATA_API_KEY=your_pinata_key
export PINATA_SECRET=your_pinata_secret

# Run deployment
cd packages/experimental
bun run deploy:ens
```

### Option B: Deploy with Local IPFS

```bash
# Start IPFS daemon
ipfs daemon &

# Set environment variables
export PRIVATE_KEY=0x...your_wallet_private_key
export ENS_NAME=your-name.eth
export NETWORK=mainnet

# Run deployment
bun run deploy:ens
```

### Option C: Manual Deployment

1. **Upload to IPFS manually**:
   ```bash
   # Using IPFS CLI
   ipfs add -r frontend/
   # Note the directory CID (starts with Qm...)
   
   # Or use Pinata web interface
   ```

2. **Set ENS contenthash**:
   - Go to [app.ens.domains](https://app.ens.domains)
   - Find your name → Records → Content Hash
   - Set to: `ipfs://QmYourCIDHere`
   - Sign transaction

3. **Access**:
   - Via eth.limo: `https://your-name.eth.limo`
   - Via eth.link: `https://your-name.eth.link`
   - In ENS-aware browser: `your-name.eth`

## Gateways

| Gateway | URL Format | Notes |
|---------|------------|-------|
| eth.limo | `your-name.eth.limo` | Cloudflare-backed, fast |
| eth.link | `your-name.eth.link` | Alternative gateway |
| Direct IPFS | `ipfs.io/ipfs/QmXxx` | Bypass ENS |
| Cloudflare IPFS | `cloudflare-ipfs.com/ipfs/QmXxx` | Fast CDN |

## Recovery: What If Files Are Lost?

### Scenario 1: IPFS CID Inaccessible

The CID is pinned on the IPFS network. Even if your pinning service goes down:

1. **Try alternative gateways**:
   ```
   https://ipfs.io/ipfs/QmYourCID
   https://cloudflare-ipfs.com/ipfs/QmYourCID
   https://dweb.link/ipfs/QmYourCID
   ```

2. **Re-pin from your local copy**:
   ```bash
   # Upload again
   ipfs add -r frontend/
   # Should produce the same CID (content-addressed)
   ```

### Scenario 2: Need to Update Frontend

1. **Build new frontend version**
2. **Upload to IPFS** → get new CID
3. **Update ENS contenthash**:
   ```bash
   bun run deploy:ens
   # Or manually via app.ens.domains
   ```

### Scenario 3: ENS Name Expires

- **Renew before expiration**: ENS names need yearly renewal
- **Set calendar reminder**: Check expiration at app.ens.domains
- **Use NameWrapper**: For subdomain management

### Scenario 4: Complete Infrastructure Recovery

Even if ALL hosting is lost, recovery is permissionless:

1. **Code is open source**: Clone from GitHub
2. **Build frontend**: `bun run build`
3. **Upload to ANY IPFS node**: No permission needed
4. **Update ENS record**: Only requires wallet signature
5. **No central authority can block you**

## Permissionless Properties

| Property | How It's Achieved |
|----------|-------------------|
| **Hosting** | IPFS - anyone can pin |
| **Domain** | ENS - wallet-owned, no registrar |
| **Updates** | Wallet signature only |
| **Access** | Multiple gateways, no single point |
| **Recovery** | Re-upload anywhere, update ENS |
| **Censorship** | No central server to block |

## Security Considerations

1. **Private Key Security**: 
   - Use a hardware wallet for ENS ownership
   - Consider multisig for high-value names

2. **IPFS Pinning**:
   - Pin on multiple services for redundancy
   - Consider Arweave for permanent storage

3. **ENS Record Management**:
   - Keep wallet secure
   - Backup seed phrase

4. **Frontend Security**:
   - All client-side JavaScript
   - No secrets in frontend code
   - RPC calls go to public nodes

## Testing on Sepolia

```bash
# Deploy to Sepolia testnet first
export NETWORK=sepolia
export ENS_NAME=your-test-name.eth

bun run deploy:ens
```

## Cost Breakdown

| Item | Cost |
|------|------|
| ENS Name (5+ chars) | ~$5/year |
| Contenthash TX (mainnet) | ~$2-10 (varies with gas) |
| Contenthash TX (Sepolia) | Free (testnet) |
| Pinata Pinning | Free tier available |
| Local IPFS | Free |

## Verification

After deployment, verify:

1. **ENS record set correctly**:
   ```bash
   # Using viem or ethers
   # OR check at app.ens.domains
   ```

2. **Gateway accessible**:
   ```bash
   curl -I https://your-name.eth.limo
   # Should return 200 OK
   ```

3. **Content hash matches**:
   - Check contenthash in ENS records
   - Compare to your IPFS CID

## Future Improvements

1. **Arweave backup**: Permanent storage alongside IPFS
2. **Automated deployment**: CI/CD pipeline
3. **Multi-chain**: Deploy to L2s for cheaper updates
4. **IPNS**: Updatable content without ENS TX

