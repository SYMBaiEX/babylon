# Babylon Deployment Guide

## Overview

This guide covers deploying the Babylon prediction market smart contracts to Base L2 (mainnet and testnet).

## Prerequisites

1. **Foundry** - Install from [getfoundry.sh](https://getfoundry.sh/)
2. **Base RPC Access** - Get RPC URLs from [Base Docs](https://docs.base.org/)
3. **Wallet with ETH** - For deployment gas fees
   - Base Sepolia: Get testnet ETH from [Base Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
   - Base Mainnet: Real ETH required

## Environment Setup

Create a `.env` file in the project root:

```bash
# Deployment wallet
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Optional: Fee recipient address (defaults to deployer)
FEE_RECIPIENT=0x...

# RPC URLs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org

# Block explorers (for verification)
BASE_SEPOLIA_ETHERSCAN_API_KEY=your_basescan_api_key
BASE_ETHERSCAN_API_KEY=your_basescan_api_key
```

⚠️ **Security Warning**: Never commit your `.env` file. Add it to `.gitignore`.

## Deployment Commands

### Base Sepolia (Testnet)

```bash
# Load environment variables
source .env

# Deploy to Base Sepolia
forge script script/DeployBabylon.s.sol:DeployBabylon \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  -vvvv

# Or use the configured RPC endpoint
forge script script/DeployBabylon.s.sol:DeployBabylon \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  -vvvv
```

### Base Mainnet (Production)

```bash
# Load environment variables
source .env

# Deploy to Base Mainnet
forge script script/DeployBabylon.s.sol:DeployBabylon \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  -vvvv

# Or use the configured RPC endpoint
forge script script/DeployBabylon.s.sol:DeployBabylon \
  --rpc-url base \
  --broadcast \
  --verify \
  -vvvv
```

## Deployment Output

After successful deployment, contract addresses will be saved to:
- **Base Sepolia**: `./deployments/base-sepolia/latest.json`
- **Base Mainnet**: `./deployments/base/latest.json`

### Example Output

```json
{
  "diamond": "0x...",
  "diamondCutFacet": "0x...",
  "diamondLoupeFacet": "0x...",
  "predictionMarketFacet": "0x...",
  "oracleFacet": "0x...",
  "identityRegistry": "0x...",
  "reputationSystem": "0x...",
  "chainlinkOracle": "0x...",
  "umaOracle": "0x...",
  "deployer": "0x..."
}
```

## Post-Deployment Configuration

### 1. Configure Default Market Parameters

```bash
# Set default liquidity (LMSR b parameter)
cast send $DIAMOND_ADDRESS \
  "setDefaultLiquidity(uint256)" \
  "1000000000000000000000" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Set default fee rate (100 = 1%)
cast send $DIAMOND_ADDRESS \
  "setDefaultFeeRate(uint256)" \
  "100" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Set fee recipient
cast send $DIAMOND_ADDRESS \
  "setFeeRecipient(address)" \
  "$FEE_RECIPIENT" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### 2. Set Oracle Addresses (Mainnet)

For mainnet deployment, replace mock oracles with real Chainlink and UMA addresses:

```bash
# Set Chainlink oracle address
cast send $DIAMOND_ADDRESS \
  "setChainlinkOracle(address)" \
  "$CHAINLINK_ORACLE_ADDRESS" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Set UMA oracle address
cast send $DIAMOND_ADDRESS \
  "setUMAOracle(address)" \
  "$UMA_ORACLE_ADDRESS" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### 3. Transfer Ownership (Optional)

```bash
# Transfer diamond ownership to multisig or DAO
cast send $DIAMOND_ADDRESS \
  "transferOwnership(address)" \
  "$NEW_OWNER_ADDRESS" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Contract Verification

Contracts are automatically verified during deployment with `--verify` flag. To verify manually:

```bash
forge verify-contract \
  --chain-id 84532 \
  --compiler-version v0.8.27 \
  $CONTRACT_ADDRESS \
  src/contracts/ContractName.sol:ContractName \
  --etherscan-api-key $BASE_SEPOLIA_ETHERSCAN_API_KEY
```

## Interacting with Deployed Contracts

### Create a Market

```bash
# Using cast
cast send $DIAMOND_ADDRESS \
  "createMarket(string,string[],uint256,address)" \
  "Will ETH reach $5000?" \
  '["Yes","No"]' \
  $(($(date +%s) + 2592000)) \
  $ORACLE_ADDRESS \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Register an AI Agent

```bash
cast send $IDENTITY_REGISTRY_ADDRESS \
  "registerAgent(string,string,bytes32,string)" \
  "AlphaAgent" \
  "https://api.example.com/agent1" \
  $(cast keccak "capabilities") \
  '{"strategy":"momentum"}' \
  --rpc-url $BASE_RPC_URL \
  --private-key $AGENT_PRIVATE_KEY
```

## Testing Deployment

Run integration tests against deployed contracts:

```bash
# Set deployed contract addresses
export DIAMOND_ADDRESS=0x...
export IDENTITY_REGISTRY_ADDRESS=0x...

# Run integration tests
forge test --fork-url $BASE_SEPOLIA_RPC_URL -vvv
```

## Upgrade Process (Diamond Standard)

To add new facets or update existing ones:

```bash
# 1. Deploy new facet
forge create --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  src/contracts/core/NewFacet.sol:NewFacet

# 2. Add facet to diamond using DiamondCutFacet
# (Requires owner/multisig)
cast send $DIAMOND_ADDRESS \
  "diamondCut((address,uint8,bytes4[])[],address,bytes)" \
  "[(facetAddress,0,[selector1,selector2])]" \
  "0x0000000000000000000000000000000000000000" \
  "0x" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Troubleshooting

### Insufficient Gas

Increase gas limit:
```bash
forge script ... --with-gas-price 2000000000 --gas-limit 10000000
```

### RPC Timeout

Use alternative RPC or increase timeout:
```bash
forge script ... --timeout 300
```

### Verification Failed

Manually verify with flattened source:
```bash
forge flatten src/contracts/core/Diamond.sol > Diamond.flat.sol
# Upload to block explorer
```

## Security Considerations

1. **Private Key Security**: Use hardware wallets or secure key management for mainnet
2. **Multisig Ownership**: Transfer ownership to multisig after deployment
3. **Oracle Configuration**: Verify oracle addresses before setting
4. **Fee Configuration**: Test fee calculations before mainnet deployment
5. **Upgrade Process**: Use timelock for diamond upgrades on mainnet

## Network Information

### Base Sepolia (Testnet)
- Chain ID: 84532
- RPC: https://sepolia.base.org
- Explorer: https://sepolia.basescan.org
- Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### Base Mainnet
- Chain ID: 8453
- RPC: https://mainnet.base.org
- Explorer: https://basescan.org

## Support

For issues or questions:
- GitHub Issues: [babylon/issues](https://github.com/yourusername/babylon/issues)
- Documentation: [docs.babylon.com](https://docs.babylon.com)
