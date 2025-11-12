# Diamond Upgrade Guide

This guide explains how to upgrade your deployed Diamond contract with new facets without redeploying or losing any data.

## Overview

The Diamond pattern (EIP-2535) allows you to upgrade smart contracts by adding, replacing, or removing facets. This upgrade adds three new facets to your existing Diamond deployment:

1. **LiquidityPoolFacet** - Constant product AMM with LP rewards
2. **PerpetualMarketFacet** - Perpetual futures with funding rates and liquidations
3. **ReferralSystemFacet** - Multi-tier referral system with commission tracking

## Key Benefits

✅ **No Redeployment** - Existing Diamond proxy stays at same address
✅ **Zero Downtime** - Upgrade happens atomically in one transaction
✅ **Data Preservation** - All existing storage variables remain intact
✅ **Backward Compatible** - Existing facets continue to work normally

## Prerequisites

1. **Deployed Diamond** - You must have an existing Diamond deployment
2. **Owner Access** - You must have the deployer private key with diamondCut permissions
3. **Foundry** - Forge must be installed for deployment
4. **RPC Access** - Access to an Ethereum/Base RPC endpoint

## Quick Start

### 1. Set Environment Variables

```bash
# Required: Your deployer private key (must match Diamond owner)
export DEPLOYER_PRIVATE_KEY=0x...

# Required: Your existing Diamond proxy address
export DIAMOND_ADDRESS=0x...

# Optional: Network-specific RPC URLs
export ETHEREUM_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

### 2. Run the Upgrade

#### Option A: Using the helper script (recommended)

```bash
# For Ethereum Sepolia
./scripts/upgrade-diamond.sh sepolia

# For Base Sepolia
./scripts/upgrade-diamond.sh base-sepolia

# For Ethereum Mainnet
./scripts/upgrade-diamond.sh mainnet

# For Base Mainnet
./scripts/upgrade-diamond.sh base
```

#### Option B: Using Forge directly

```bash
forge script scripts/UpgradeDiamond.s.sol:UpgradeDiamond \
    --rpc-url $ETHEREUM_SEPOLIA_RPC_URL \
    --broadcast \
    --verify \
    -vvv
```

#### Option C: Using npm/bun

```bash
# Add to package.json first:
bun run contracts:upgrade:sepolia
bun run contracts:upgrade:base-sepolia
```

### 3. Verify the Upgrade

The script automatically verifies the upgrade by:
- Listing all facets after the upgrade
- Counting function selectors per facet
- Confirming the new facets were added

You can also manually verify using the DiamondLoupe facet:

```solidity
IDiamondLoupe loupe = IDiamondLoupe(diamondAddress);
address[] memory facets = loupe.facetAddresses();
// Should show 6+ facets now (original + 3 new ones)
```

## What Happens During Upgrade

1. **Deploy New Facets**
   - LiquidityPoolFacet deployed
   - PerpetualMarketFacet deployed
   - ReferralSystemFacet deployed

2. **Prepare FacetCuts**
   - Function selectors extracted from each facet
   - FacetCut structs created with Add action
   - All 3 facets batched into one diamondCut call

3. **Execute DiamondCut**
   - `IDiamondCut(diamond).diamondCut(cuts, address(0), "")` called
   - Diamond storage updated to map selectors to new facets
   - Events emitted for each added facet

4. **Verification**
   - Query DiamondLoupe for updated facet list
   - Confirm selector counts match expectations

## Storage Safety

The new facets use separate storage structs that don't conflict with existing storage:

```solidity
// Existing storage (unchanged)
LibMarket.MarketStorage  // Continues to work as before

// New storage (separate slots)
LibLiquidity.LiquidityStorage  // New storage for pools
LibPerpetual.PerpetualStorage  // New storage for perps
```

Diamond storage layout ensures no collisions between facets using the storage slot pattern:

```solidity
bytes32 constant MARKET_STORAGE_POSITION = keccak256("babylon.market.storage");
bytes32 constant LIQUIDITY_STORAGE_POSITION = keccak256("babylon.liquidity.storage");
bytes32 constant PERPETUAL_STORAGE_POSITION = keccak256("babylon.perpetual.storage");
```

## Testing After Upgrade

### 1. Basic Smoke Tests

```bash
# Test liquidity pool creation
cast send $DIAMOND_ADDRESS "createLiquidityPool(uint256,uint256,uint256)" \
    --private-key $DEPLOYER_PRIVATE_KEY

# Test perpetual market creation
cast send $DIAMOND_ADDRESS "createPerpetualMarket(string,uint256,uint256)" \
    --private-key $DEPLOYER_PRIVATE_KEY

# Test referral registration
cast send $DIAMOND_ADDRESS "registerReferral(address)" \
    --private-key $DEPLOYER_PRIVATE_KEY
```

### 2. Integration Tests

```bash
# Run full test suite
forge test

# Run specific facet tests
forge test --match-contract LiquidityPoolFacetTest
forge test --match-contract PerpetualMarketFacetTest
forge test --match-contract ReferralSystemFacetTest
```

### 3. Gas Cost Analysis

```bash
# Get gas report
forge test --gas-report

# Compare with pre-upgrade gas costs
```

## Rollback Strategy

If you need to rollback the upgrade:

1. **Remove Facets** (requires another diamondCut)
```solidity
IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](3);
// Set action to Remove for each facet
cuts[0].action = IDiamondCut.FacetCutAction.Remove;
// ... specify selectors to remove
IDiamondCut(diamond).diamondCut(cuts, address(0), "");
```

2. **Replace with Previous Versions** (if you have them)
```solidity
// Deploy old facet versions
// Use Replace action in diamondCut
cuts[0].action = IDiamondCut.FacetCutAction.Replace;
```

## Troubleshooting

### Error: "Function does not exist"
- **Cause**: Selector conflict or facet not properly added
- **Solution**: Check DiamondLoupe to verify selectors were added

### Error: "Only contract owner can call"
- **Cause**: DEPLOYER_PRIVATE_KEY doesn't match Diamond owner
- **Solution**: Use the correct private key or transfer ownership first

### Error: "Can't add function that already exists"
- **Cause**: Trying to add a function that's already in the Diamond
- **Solution**: Use Replace action instead of Add, or remove the function first

### Gas Estimation Fails
- **Cause**: Complex diamondCut operations may require high gas
- **Solution**: Increase gas limit manually: `--gas-limit 5000000`

## Cost Estimation

| Network | Est. Gas | Est. Cost @ 20 gwei |
|---------|----------|---------------------|
| Ethereum Mainnet | ~2,000,000 | ~0.04 ETH |
| Ethereum Sepolia | ~2,000,000 | Free (testnet) |
| Base Mainnet | ~2,000,000 | ~0.001 ETH |
| Base Sepolia | ~2,000,000 | Free (testnet) |

**Note**: Actual costs vary based on network congestion and contract size.

## Production Checklist

Before upgrading on mainnet:

- [ ] Test upgrade on Sepolia/Base Sepolia testnet
- [ ] Verify all new functions work correctly
- [ ] Run full integration test suite
- [ ] Check gas costs are acceptable
- [ ] Backup deployment addresses
- [ ] Notify users of upgrade (if adding breaking changes)
- [ ] Have rollback plan ready
- [ ] Monitor transaction closely
- [ ] Verify upgrade succeeded via DiamondLoupe
- [ ] Update frontend to use new features

## Additional Resources

- [EIP-2535 Diamond Standard](https://eips.ethereum.org/EIPS/eip-2535)
- [Diamond Storage Pattern](https://dev.to/mudgen/how-diamond-storage-works-90e)
- [Foundry Documentation](https://book.getfoundry.sh/)
- [Babylon Contracts Documentation](./content/contracts/architecture.mdx)

## Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review transaction logs for specific error messages
3. Test on testnet first before upgrading mainnet
4. Reach out in Discord/Telegram for help
