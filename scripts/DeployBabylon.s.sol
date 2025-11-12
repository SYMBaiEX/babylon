// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../contracts/core/Diamond.sol";
import "../contracts/core/DiamondCutFacet.sol";
import "../contracts/core/DiamondLoupeFacet.sol";
import "../contracts/core/PredictionMarketFacet.sol";
import "../contracts/core/OracleFacet.sol";
import "../contracts/core/LiquidityPoolFacet.sol";
import "../contracts/core/PerpetualMarketFacet.sol";
import "../contracts/core/ReferralSystemFacet.sol";
import "../contracts/identity/ERC8004IdentityRegistry.sol";
import "../contracts/identity/ERC8004ReputationSystem.sol";
import "../contracts/oracles/ChainlinkOracleMock.sol";
import "../contracts/oracles/UMAOracleMock.sol";
import "../contracts/libraries/LibDiamond.sol";

/// @title DeployBabylon
/// @notice Deployment script for Babylon prediction market on Base L2
contract DeployBabylon is Script {
    // Deployed contracts
    Diamond public diamond;
    DiamondCutFacet public diamondCutFacet;
    DiamondLoupeFacet public diamondLoupeFacet;
    PredictionMarketFacet public predictionMarketFacet;
    OracleFacet public oracleFacet;
    LiquidityPoolFacet public liquidityPoolFacet;
    PerpetualMarketFacet public perpetualMarketFacet;
    ReferralSystemFacet public referralSystemFacet;
    ERC8004IdentityRegistry public identityRegistry;
    ERC8004ReputationSystem public reputationSystem;
    ChainlinkOracleMock public chainlinkOracle;
    UMAOracleMock public umaOracle;

    // Deployment configuration
    address public deployer;
    address public feeRecipient;

    function run() external {
        // Get deployer from private key
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        deployer = vm.addr(deployerPrivateKey);

        // Set fee recipient (can be changed later)
        feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);

        console.log("Deploying Babylon to Base L2...");
        console.log("Deployer:", deployer);
        console.log("Fee Recipient:", feeRecipient);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy facets
        console.log("\n1. Deploying facets...");
        diamondCutFacet = new DiamondCutFacet();
        console.log("DiamondCutFacet:", address(diamondCutFacet));

        diamondLoupeFacet = new DiamondLoupeFacet();
        console.log("DiamondLoupeFacet:", address(diamondLoupeFacet));

        predictionMarketFacet = new PredictionMarketFacet();
        console.log("PredictionMarketFacet:", address(predictionMarketFacet));

        oracleFacet = new OracleFacet();
        console.log("OracleFacet:", address(oracleFacet));

        // 2. Deploy Diamond with DiamondCutFacet
        console.log("\n2. Deploying Diamond...");
        diamond = new Diamond(address(diamondCutFacet), address(diamondLoupeFacet));
        console.log("Diamond:", address(diamond));

        // 3. Add DiamondLoupeFacet
        console.log("\n3. Adding DiamondLoupeFacet...");
        IDiamondCut.FacetCut[] memory loupeCut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory loupeSelectors = new bytes4[](5);
        loupeSelectors[0] = DiamondLoupeFacet.facets.selector;
        loupeSelectors[1] = DiamondLoupeFacet.facetFunctionSelectors.selector;
        loupeSelectors[2] = DiamondLoupeFacet.facetAddresses.selector;
        loupeSelectors[3] = DiamondLoupeFacet.facetAddress.selector;
        loupeSelectors[4] = bytes4(keccak256("supportsInterface(bytes4)"));

        loupeCut[0] = IDiamondCut.FacetCut({
            facetAddress: address(diamondLoupeFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: loupeSelectors
        });

        IDiamondCut(address(diamond)).diamondCut(loupeCut, address(0), "");

        // 4. Add PredictionMarketFacet
        console.log("\n4. Adding PredictionMarketFacet...");
        IDiamondCut.FacetCut[] memory marketCut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory marketSelectors = new bytes4[](13);
        marketSelectors[0] = PredictionMarketFacet.createMarket.selector;
        marketSelectors[1] = PredictionMarketFacet.calculateCost.selector;
        marketSelectors[2] = PredictionMarketFacet.buyShares.selector;
        marketSelectors[3] = PredictionMarketFacet.sellShares.selector;
        marketSelectors[4] = PredictionMarketFacet.calculateSellPayout.selector;
        marketSelectors[5] = PredictionMarketFacet.resolveMarket.selector;
        marketSelectors[6] = PredictionMarketFacet.claimWinnings.selector;
        marketSelectors[7] = PredictionMarketFacet.deposit.selector;
        marketSelectors[8] = PredictionMarketFacet.withdraw.selector;
        marketSelectors[9] = PredictionMarketFacet.getBalance.selector;
        marketSelectors[10] = PredictionMarketFacet.getMarket.selector;
        marketSelectors[11] = PredictionMarketFacet.getMarketShares.selector;
        marketSelectors[12] = PredictionMarketFacet.getPosition.selector;

        marketCut[0] = IDiamondCut.FacetCut({
            facetAddress: address(predictionMarketFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: marketSelectors
        });

        IDiamondCut(address(diamond)).diamondCut(marketCut, address(0), "");

        // 5. Add OracleFacet
        console.log("\n5. Adding OracleFacet...");
        IDiamondCut.FacetCut[] memory oracleCut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory oracleSelectors = new bytes4[](8);
        oracleSelectors[0] = OracleFacet.requestChainlinkResolution.selector;
        oracleSelectors[1] = OracleFacet.requestUMAResolution.selector;
        oracleSelectors[2] = OracleFacet.oracleCallback.selector;
        oracleSelectors[3] = OracleFacet.umaOracleCallback.selector;
        oracleSelectors[4] = OracleFacet.setChainlinkOracle.selector;
        oracleSelectors[5] = OracleFacet.setUMAOracle.selector;
        oracleSelectors[6] = OracleFacet.manualResolve.selector;
        oracleSelectors[7] = OracleFacet.getOracleAddresses.selector;

        oracleCut[0] = IDiamondCut.FacetCut({
            facetAddress: address(oracleFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: oracleSelectors
        });

        IDiamondCut(address(diamond)).diamondCut(oracleCut, address(0), "");

        // 6. Deploy and add new facets (LiquidityPool, PerpetualMarket, ReferralSystem)
        console.log("\n6. Deploying new facets...");
        liquidityPoolFacet = new LiquidityPoolFacet();
        console.log("LiquidityPoolFacet:", address(liquidityPoolFacet));

        perpetualMarketFacet = new PerpetualMarketFacet();
        console.log("PerpetualMarketFacet:", address(perpetualMarketFacet));

        referralSystemFacet = new ReferralSystemFacet();
        console.log("ReferralSystemFacet:", address(referralSystemFacet));

        // 7. Add new facets to Diamond
        console.log("\n7. Adding new facets to Diamond...");
        IDiamondCut.FacetCut[] memory newFacetsCut = new IDiamondCut.FacetCut[](3);

        // LiquidityPoolFacet selectors
        bytes4[] memory liquiditySelectors = new bytes4[](12);
        liquiditySelectors[0] = LiquidityPoolFacet.createLiquidityPool.selector;
        liquiditySelectors[1] = LiquidityPoolFacet.addLiquidity.selector;
        liquiditySelectors[2] = LiquidityPoolFacet.removeLiquidity.selector;
        liquiditySelectors[3] = LiquidityPoolFacet.swap.selector;
        liquiditySelectors[4] = LiquidityPoolFacet.getPool.selector;
        liquiditySelectors[5] = LiquidityPoolFacet.getLPPosition.selector;
        liquiditySelectors[6] = LiquidityPoolFacet.getSwapOutput.selector;
        liquiditySelectors[7] = LiquidityPoolFacet.getUtilization.selector;
        liquiditySelectors[8] = LiquidityPoolFacet.getReserves.selector;
        liquiditySelectors[9] = LiquidityPoolFacet.getPriceImpact.selector;
        liquiditySelectors[10] = LiquidityPoolFacet.getPendingRewards.selector;
        liquiditySelectors[11] = LiquidityPoolFacet.claimRewards.selector;

        newFacetsCut[0] = IDiamondCut.FacetCut({
            facetAddress: address(liquidityPoolFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: liquiditySelectors
        });

        // PerpetualMarketFacet selectors
        bytes4[] memory perpetualSelectors = new bytes4[](10);
        perpetualSelectors[0] = PerpetualMarketFacet.createPerpetualMarket.selector;
        perpetualSelectors[1] = PerpetualMarketFacet.openPosition.selector;
        perpetualSelectors[2] = PerpetualMarketFacet.closePosition.selector;
        perpetualSelectors[3] = PerpetualMarketFacet.liquidatePosition.selector;
        perpetualSelectors[4] = PerpetualMarketFacet.updateFundingRate.selector;
        perpetualSelectors[5] = PerpetualMarketFacet.getPerpetualMarket.selector;
        perpetualSelectors[6] = PerpetualMarketFacet.getPosition.selector;
        perpetualSelectors[7] = PerpetualMarketFacet.getLiquidationPrice.selector;
        perpetualSelectors[8] = PerpetualMarketFacet.getMarkPrice.selector;
        perpetualSelectors[9] = PerpetualMarketFacet.getFundingRate.selector;

        newFacetsCut[1] = IDiamondCut.FacetCut({
            facetAddress: address(perpetualMarketFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: perpetualSelectors
        });

        // ReferralSystemFacet selectors
        bytes4[] memory referralSelectors = new bytes4[](10);
        referralSelectors[0] = ReferralSystemFacet.registerReferral.selector;
        referralSelectors[1] = ReferralSystemFacet.payReferralCommission.selector;
        referralSelectors[2] = ReferralSystemFacet.claimReferralEarnings.selector;
        referralSelectors[3] = ReferralSystemFacet.getReferralData.selector;
        referralSelectors[4] = ReferralSystemFacet.getTierInfo.selector;
        referralSelectors[5] = ReferralSystemFacet.getReferralChain.selector;
        referralSelectors[6] = ReferralSystemFacet.getTotalReferrals.selector;
        referralSelectors[7] = ReferralSystemFacet.getTotalCommissions.selector;
        referralSelectors[8] = ReferralSystemFacet.isReferred.selector;
        referralSelectors[9] = ReferralSystemFacet.calculateCommission.selector;

        newFacetsCut[2] = IDiamondCut.FacetCut({
            facetAddress: address(referralSystemFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: referralSelectors
        });

        IDiamondCut(address(diamond)).diamondCut(newFacetsCut, address(0), "");

        // 8. Deploy ERC-8004 Identity Registry
        console.log("\n8. Deploying ERC-8004 Identity Registry...");
        identityRegistry = new ERC8004IdentityRegistry();
        console.log("IdentityRegistry:", address(identityRegistry));

        // 9. Deploy ERC-8004 Reputation System
        console.log("\n9. Deploying ERC-8004 Reputation System...");
        reputationSystem = new ERC8004ReputationSystem(address(identityRegistry));
        console.log("ReputationSystem:", address(reputationSystem));

        // 10. Deploy Oracle Mocks (for testnet)
        if (block.chainid == 84532) { // Base Sepolia
            console.log("\n10. Deploying Oracle Mocks (Testnet)...");
            chainlinkOracle = new ChainlinkOracleMock();
            console.log("ChainlinkOracle:", address(chainlinkOracle));

            umaOracle = new UMAOracleMock();
            console.log("UMAOracle:", address(umaOracle));

            // Set oracle addresses in diamond
            OracleFacet(address(diamond)).setChainlinkOracle(address(chainlinkOracle));
            OracleFacet(address(diamond)).setUMAOracle(address(umaOracle));
        } else {
            console.log("\n10. Skipping Oracle Mocks (Mainnet - use real oracles)");
        }

        vm.stopBroadcast();

        // Print deployment summary
        console.log("\n=== Deployment Summary ===");
        console.log("Diamond (Proxy):", address(diamond));
        console.log("DiamondCutFacet:", address(diamondCutFacet));
        console.log("DiamondLoupeFacet:", address(diamondLoupeFacet));
        console.log("PredictionMarketFacet:", address(predictionMarketFacet));
        console.log("OracleFacet:", address(oracleFacet));
        console.log("LiquidityPoolFacet:", address(liquidityPoolFacet));
        console.log("PerpetualMarketFacet:", address(perpetualMarketFacet));
        console.log("ReferralSystemFacet:", address(referralSystemFacet));
        console.log("IdentityRegistry:", address(identityRegistry));
        console.log("ReputationSystem:", address(reputationSystem));
        if (block.chainid == 84532) {
            console.log("ChainlinkOracle (Mock):", address(chainlinkOracle));
            console.log("UMAOracle (Mock):", address(umaOracle));
        }

        // Save deployment addresses
        // _saveDeployment();  // Skipping file save - will save manually
    }

    function _saveDeployment() internal {
        string memory json = "deployment";

        vm.serializeAddress(json, "diamond", address(diamond));
        vm.serializeAddress(json, "diamondCutFacet", address(diamondCutFacet));
        vm.serializeAddress(json, "diamondLoupeFacet", address(diamondLoupeFacet));
        vm.serializeAddress(json, "predictionMarketFacet", address(predictionMarketFacet));
        vm.serializeAddress(json, "oracleFacet", address(oracleFacet));
        vm.serializeAddress(json, "identityRegistry", address(identityRegistry));
        vm.serializeAddress(json, "reputationSystem", address(reputationSystem));

        if (block.chainid == 84532) {
            vm.serializeAddress(json, "chainlinkOracle", address(chainlinkOracle));
            vm.serializeAddress(json, "umaOracle", address(umaOracle));
        }

        string memory chainFolder = block.chainid == 8453 ? "base" : "base-sepolia";
        string memory output = vm.serializeAddress(json, "deployer", deployer);

        vm.writeJson(output, string.concat("./deployments/", chainFolder, "/latest.json"));

        console.log("\nDeployment saved to ./deployments/", chainFolder, "/latest.json");
    }
}
