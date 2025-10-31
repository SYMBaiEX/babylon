#!/bin/bash

# Contract Verification Script for Base Sepolia
# Verifies all deployed Babylon contracts on BaseScan (Etherscan API V2)
#
# NOTE: BaseScan has migrated to Etherscan API V2
# Get your API key from: https://basescan.org/myapikey

set -e

# Load environment variables
source .env

# Check if API key is set
if [ -z "$ETHERSCAN_API_KEY" ]; then
  echo "❌ Error: ETHERSCAN_API_KEY not set in .env file"
  echo "Get your API key from: https://basescan.org/myapikey"
  echo "Note: BaseScan now uses Etherscan API V2"
  exit 1
fi

echo "🔍 Starting contract verification on Base Sepolia..."
echo "============================================================"

# Deployed addresses (from deployment)
DEPLOYER="0xFfA6A2Ac8bcAE47af29b623B97071E676647556A"
DIAMOND_CUT_FACET="0xA47E18989FDBE79CA7Ea7726662aD99d0D2514c1"
DIAMOND_LOUPE_FACET="0x322Ded7A129E654C827eF1288c56087652610205"
PREDICTION_MARKET_FACET="0x95A1aEe004de01267daDD1e55C1a3fc2818636cE"
ORACLE_FACET="0x58A0Cd5307CdE4F2ccD8E2cA71510206F1365D9B"
DIAMOND="0xdC3f0aD2f76Cea9379af897fa8EAD4A6d5e43990"
IDENTITY_REGISTRY="0x4102F9b209796b53a18B063A438D05C7C9Af31A2"
REPUTATION_SYSTEM="0x7960E6044bbeE480F5388be1903b3A1dd69c126D"
CHAINLINK_ORACLE="0x2b66946c747DDc3fB0e303d40c3f2F6CE89928FB"
UMA_ORACLE="0xC128cb3A64077983c3036D5a8b08d1B67FF6A3c4"

# 1. Verify DiamondCutFacet (no constructor args)
echo "1️⃣  Verifying DiamondCutFacet..."
forge verify-contract \
  $DIAMOND_CUT_FACET \
  contracts/core/DiamondCutFacet.sol:DiamondCutFacet \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  DiamondCutFacet verification failed (may already be verified)"

# 2. Verify DiamondLoupeFacet (no constructor args)
echo "2️⃣  Verifying DiamondLoupeFacet..."
forge verify-contract \
  $DIAMOND_LOUPE_FACET \
  contracts/core/DiamondLoupeFacet.sol:DiamondLoupeFacet \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  DiamondLoupeFacet verification failed"

# 3. Verify PredictionMarketFacet (no constructor args)
echo "3️⃣  Verifying PredictionMarketFacet..."
forge verify-contract \
  $PREDICTION_MARKET_FACET \
  contracts/core/PredictionMarketFacet.sol:PredictionMarketFacet \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  PredictionMarketFacet verification failed"

# 4. Verify OracleFacet (no constructor args)
echo "4️⃣  Verifying OracleFacet..."
forge verify-contract \
  $ORACLE_FACET \
  contracts/core/OracleFacet.sol:OracleFacet \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  OracleFacet verification failed"

# 5. Verify Diamond (constructor: address _contractOwner, address _diamondCutFacet)
echo "5️⃣  Verifying Diamond..."
forge verify-contract \
  $DIAMOND \
  contracts/core/Diamond.sol:Diamond \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address)" $DEPLOYER $DIAMOND_CUT_FACET) \
  --watch || echo "⚠️  Diamond verification failed"

# 6. Verify ERC8004IdentityRegistry (no constructor args)
echo "6️⃣  Verifying ERC8004IdentityRegistry..."
forge verify-contract \
  $IDENTITY_REGISTRY \
  contracts/identity/ERC8004IdentityRegistry.sol:ERC8004IdentityRegistry \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  IdentityRegistry verification failed"

# 7. Verify ERC8004ReputationSystem (constructor: address _identityRegistry)
echo "7️⃣  Verifying ERC8004ReputationSystem..."
forge verify-contract \
  $REPUTATION_SYSTEM \
  contracts/identity/ERC8004ReputationSystem.sol:ERC8004ReputationSystem \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" $IDENTITY_REGISTRY) \
  --watch || echo "⚠️  ReputationSystem verification failed"

# 8. Verify ChainlinkOracleMock (no constructor args)
echo "8️⃣  Verifying ChainlinkOracleMock..."
forge verify-contract \
  $CHAINLINK_ORACLE \
  contracts/oracles/ChainlinkOracleMock.sol:ChainlinkOracleMock \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  ChainlinkOracle verification failed"

# 9. Verify UMAOracleMock (no constructor args)
echo "9️⃣  Verifying UMAOracleMock..."
forge verify-contract \
  $UMA_ORACLE \
  contracts/oracles/UMAOracleMock.sol:UMAOracleMock \
  --chain-id 84532 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch || echo "⚠️  UMAOracle verification failed"

echo ""
echo "✅ Verification complete!"
echo "============================================================"
echo "View contracts on BaseScan:"
echo "  Diamond: https://sepolia.basescan.org/address/$DIAMOND"
echo "  Identity Registry: https://sepolia.basescan.org/address/$IDENTITY_REGISTRY"
echo "  Reputation System: https://sepolia.basescan.org/address/$REPUTATION_SYSTEM"
