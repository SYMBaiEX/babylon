declare module '@babylon/contracts/deployments/local' {
  interface Contracts {
    diamond: string;
    diamondCutFacet: string;
    diamondLoupeFacet: string;
    predictionMarketFacet: string;
    oracleFacet: string;
    liquidityPoolFacet: string;
    perpetualMarketFacet: string;
    referralSystemFacet: string;
    priceStorageFacet: string;
    identityRegistry: string;
    reputationSystem: string;
    babylonOracle: string;
    predimarket: string;
    marketFactory: string;
    contestOracle: string;
    banManager: string;
    reportingSystem: string;
    labelManager: string;
    chainlinkOracle?: string;
    umaOracle?: string;
    testToken?: string;
  }

  interface Deployment {
    network: string;
    chainId: number;
    contracts: Contracts;
    deployer: string;
    timestamp: string;
    blockNumber: number;
  }

  const deployment: Deployment;
  export default deployment;
}

declare module '@babylon/contracts/deployments/base-sepolia' {
  interface Contracts {
    diamond: string;
    diamondCutFacet: string;
    diamondLoupeFacet: string;
    predictionMarketFacet: string;
    oracleFacet: string;
    liquidityPoolFacet: string;
    perpetualMarketFacet: string;
    referralSystemFacet: string;
    priceStorageFacet: string;
    identityRegistry: string;
    reputationSystem: string;
    babylonOracle?: string;
    predimarket?: string;
    marketFactory?: string;
    contestOracle?: string;
    banManager?: string;
    reportingSystem?: string;
    labelManager?: string;
    chainlinkOracle?: string;
    umaOracle?: string;
    testToken?: string;
  }

  interface Deployment {
    network: string;
    chainId: number;
    contracts: Contracts;
    deployer: string;
    timestamp: string;
    blockNumber: number;
  }

  const deployment: Deployment;
  export default deployment;
}

declare module '@babylon/contracts/deployments/base' {
  interface Contracts {
    diamond: string;
    diamondCutFacet: string;
    diamondLoupeFacet: string;
    predictionMarketFacet: string;
    oracleFacet: string;
    liquidityPoolFacet: string;
    perpetualMarketFacet: string;
    referralSystemFacet: string;
    priceStorageFacet: string;
    identityRegistry: string;
    reputationSystem: string;
    babylonOracle?: string;
    predimarket?: string;
    marketFactory?: string;
    contestOracle?: string;
    banManager?: string;
    reportingSystem?: string;
    labelManager?: string;
  }

  interface Deployment {
    network: string;
    chainId: number;
    contracts: Contracts;
    deployer: string;
    timestamp: string;
    blockNumber: number;
  }

  const deployment: Deployment;
  export default deployment;
}
