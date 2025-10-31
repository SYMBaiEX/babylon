/**
 * React hooks for interacting with smart contracts
 */

import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { getContract, type Address } from 'viem'
import { useMemo } from 'react'
import { getContractAddresses, areContractsDeployed } from '@/lib/web3/contracts'
import { logger } from '@/lib/logger'
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_SYSTEM_ABI,
  PREDICTION_MARKET_ABI,
  ORACLE_ABI,
} from '@/lib/web3/abis'

/**
 * Hook to get contract instances with read/write capabilities
 */
export function useContracts() {
  const chainId = useChainId()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const contracts = useMemo(() => {
    if (!publicClient) return null

    const addresses = getContractAddresses(chainId)
    const deployed = areContractsDeployed(chainId)

    if (!deployed) {
      return null
    }

    // Read-only contracts (using public client)
    const identityRegistry = getContract({
      address: addresses.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      client: publicClient,
    })

    const reputationSystem = getContract({
      address: addresses.reputationSystem,
      abi: REPUTATION_SYSTEM_ABI,
      client: publicClient,
    })

    const predictionMarket = getContract({
      address: addresses.diamond,
      abi: PREDICTION_MARKET_ABI,
      client: publicClient,
    })

    const oracle = getContract({
      address: addresses.diamond,
      abi: ORACLE_ABI,
      client: publicClient,
    })

    // Write-enabled contracts (requires wallet client)
    const writable = walletClient
      ? {
          identityRegistry: getContract({
            address: addresses.identityRegistry,
            abi: IDENTITY_REGISTRY_ABI,
            client: walletClient,
          }),
          reputationSystem: getContract({
            address: addresses.reputationSystem,
            abi: REPUTATION_SYSTEM_ABI,
            client: walletClient,
          }),
          predictionMarket: getContract({
            address: addresses.diamond,
            abi: PREDICTION_MARKET_ABI,
            client: walletClient,
          }),
          oracle: getContract({
            address: addresses.diamond,
            abi: ORACLE_ABI,
            client: walletClient,
          }),
        }
      : null

    return {
      read: {
        identityRegistry,
        reputationSystem,
        predictionMarket,
        oracle,
      },
      write: writable,
      addresses,
    }
  }, [chainId, publicClient, walletClient])

  return {
    contracts,
    isDeployed: areContractsDeployed(chainId),
    chainId,
    address,
    isConnected: !!address,
  }
}

/**
 * Hook for agent identity registry operations
 */
export function useAgentRegistry() {
  const { contracts, isDeployed, address } = useContracts()

  return {
    // Read operations
    getAgentProfile: async (tokenId: number) => {
      if (!contracts || !contracts.read.identityRegistry.read.getAgentProfile) return null
      try {
        const profile = await contracts.read.identityRegistry.read.getAgentProfile([BigInt(tokenId)]) as {
          name: string
          endpoint: string
          capabilitiesHash: `0x${string}`
          registeredAt: bigint
          isActive: boolean
          metadata: string
        }
        return profile
      } catch (error) {
        logger.error('Error getting profile:', error, 'useContracts')
        return null
      }
    },

    getTokenId: async (ownerAddress: Address) => {
      if (!contracts || !contracts.read.identityRegistry.read.getTokenId) return null
      try {
        const tokenId = await contracts.read.identityRegistry.read.getTokenId([ownerAddress]) as bigint
        return tokenId === 0n ? null : Number(tokenId)
      } catch (error) {
        logger.error('Error getting token:', error, 'useContracts')
        return null
      }
    },

    getAllActiveAgents: async () => {
      if (!contracts || !contracts.read.identityRegistry.read.getAllActiveAgents) return []
      try {
        const tokenIds = await contracts.read.identityRegistry.read.getAllActiveAgents() as bigint[]
        return tokenIds.map(id => Number(id))
      } catch (error) {
        logger.error('Error getting active agents:', error, 'useContracts')
        return []
      }
    },

    isEndpointActive: async (endpoint: string) => {
      if (!contracts || !contracts.read.identityRegistry.read.isEndpointActive) return false
      try {
        const result = await contracts.read.identityRegistry.read.isEndpointActive([endpoint]) as boolean
        return result
      } catch (error) {
        logger.error('Error checking endpoint:', error, 'useContracts')
        return false
      }
    },

    getAgentsByCapability: async (capabilityHash: `0x${string}`) => {
      if (!contracts || !contracts.read.identityRegistry.read.getAgentsByCapability) return []
      try {
        const tokenIds = await contracts.read.identityRegistry.read.getAgentsByCapability([capabilityHash]) as bigint[]
        return tokenIds.map(id => Number(id))
      } catch (error) {
        logger.error('Error getting agents by capability:', error, 'useContracts')
        return []
      }
    },

    // Write operations (requires wallet connection)
    registerAgent: async (
      name: string,
      endpoint: string,
      capabilitiesHash: `0x${string}`,
      metadataURI: string
    ) => {
      if (!contracts?.write || !contracts.write.identityRegistry.write.registerAgent) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.identityRegistry.write.registerAgent([
          name,
          endpoint,
          capabilitiesHash,
          metadataURI,
        ]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error registering agent:', error, 'useContracts')
        throw error
      }
    },

    updateAgent: async (
      endpoint: string,
      capabilitiesHash: `0x${string}`,
      metadataURI: string
    ) => {
      if (!contracts?.write || !contracts.write.identityRegistry.write.updateAgent) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.identityRegistry.write.updateAgent([
          endpoint,
          capabilitiesHash,
          metadataURI,
        ]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error updating agent:', error, 'useContracts')
        throw error
      }
    },

    deactivateAgent: async () => {
      if (!contracts?.write || !contracts.write.identityRegistry.write.deactivateAgent) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.identityRegistry.write.deactivateAgent([]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error deactivating agent:', error, 'useContracts')
        throw error
      }
    },

    reactivateAgent: async () => {
      if (!contracts?.write || !contracts.write.identityRegistry.write.reactivateAgent) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.identityRegistry.write.reactivateAgent([]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error reactivating agent:', error, 'useContracts')
        throw error
      }
    },

    isDeployed,
    address,
  }
}

/**
 * Hook for reputation system operations
 */
export function useReputation() {
  const { contracts, isDeployed } = useContracts()

  return {
    // Read operations
    getReputation: async (tokenId: number) => {
      if (!contracts || !contracts.read.reputationSystem.read.getReputation) return null
      try {
        const rep = await contracts.read.reputationSystem.read.getReputation([BigInt(tokenId)]) as [
          bigint, // totalBets
          bigint, // winningBets
          bigint, // totalVolume
          bigint, // profitLoss
          bigint, // accuracyScore
          bigint, // trustScore
          boolean // isBanned
        ]
        return {
          totalBets: Number(rep[0]),
          winningBets: Number(rep[1]),
          totalVolume: Number(rep[2]),
          profitLoss: Number(rep[3]),
          accuracyScore: Number(rep[4]),
          trustScore: Number(rep[5]),
          isBanned: rep[6],
        }
      } catch (error) {
        logger.error('Error getting reputation:', error, 'useContracts')
        return null
      }
    },

    getTrustScore: async (tokenId: number) => {
      const rep = await (async () => {
        if (!contracts || !contracts.read.reputationSystem.read.getReputation) return null
        try {
          const repResult = await contracts.read.reputationSystem.read.getReputation([BigInt(tokenId)]) as [
            bigint, bigint, bigint, bigint, bigint, bigint, boolean
          ]
          return {
            totalBets: Number(repResult[0]),
            winningBets: Number(repResult[1]),
            totalVolume: Number(repResult[2]),
            profitLoss: Number(repResult[3]),
            accuracyScore: Number(repResult[4]),
            trustScore: Number(repResult[5]),
            isBanned: repResult[6],
          }
        } catch {
          return null
        }
      })()
      return rep ? rep.trustScore : 0
    },

    getAccuracyScore: async (tokenId: number) => {
      const rep = await (async () => {
        if (!contracts || !contracts.read.reputationSystem.read.getReputation) return null
        try {
          const repResult = await contracts.read.reputationSystem.read.getReputation([BigInt(tokenId)]) as [
            bigint, bigint, bigint, bigint, bigint, bigint, boolean
          ]
          return {
            totalBets: Number(repResult[0]),
            winningBets: Number(repResult[1]),
            totalVolume: Number(repResult[2]),
            profitLoss: Number(repResult[3]),
            accuracyScore: Number(repResult[4]),
            trustScore: Number(repResult[5]),
            isBanned: repResult[6],
          }
        } catch {
          return null
        }
      })()
      return rep ? rep.accuracyScore : 0
    },

    getAgentsByMinScore: async (minScore: number) => {
      if (!contracts || !contracts.read.reputationSystem.read.getAgentsByMinScore) return []
      try {
        const tokenIds = await contracts.read.reputationSystem.read.getAgentsByMinScore([
          BigInt(minScore),
        ]) as bigint[]
        return tokenIds.map(id => Number(id))
      } catch (error) {
        logger.error('Error getting agents by score:', error, 'useContracts')
        return []
      }
    },

    getFeedback: async (tokenId: number, offset: number, limit: number) => {
      if (!contracts || !contracts.read.reputationSystem.read.getFeedback) return []
      try {
        const feedback = await contracts.read.reputationSystem.read.getFeedback([
          BigInt(tokenId),
          BigInt(offset),
          BigInt(limit),
        ]) as Array<{
          from: bigint
          rating: bigint
          comment: string
          timestamp: bigint
        }>
        return feedback.map(f => ({
          from: Number(f.from),
          rating: Number(f.rating),
          comment: f.comment,
          timestamp: Number(f.timestamp),
        }))
      } catch (error) {
        logger.error('Error getting feedback:', error, 'useContracts')
        return []
      }
    },

    // Write operations (requires wallet connection)
    submitFeedback: async (
      toTokenId: number,
      rating: number,
      comment: string
    ) => {
      if (!contracts?.write || !contracts.write.reputationSystem.write.submitFeedback) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.reputationSystem.write.submitFeedback([
          BigInt(0), // fromTokenId - will be auto-detected by contract
          BigInt(toTokenId),
          BigInt(rating),
          comment,
        ]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error submitting feedback:', error, 'useContracts')
        throw error
      }
    },

    isDeployed,
  }
}

/**
 * Hook for prediction market operations
 */
export function usePredictionMarket() {
  const { contracts, isDeployed, address } = useContracts()

  return {
    // Read operations
    getMarket: async (marketId: `0x${string}`) => {
      if (!contracts || !contracts.read.predictionMarket.read.getMarket) return null
      try {
        const market = await contracts.read.predictionMarket.read.getMarket([marketId]) as {
          question: string
          outcomes: string[]
          prices: bigint[]
          totalLiquidity: bigint
          endTime: bigint
          resolved: boolean
          winningOutcome: bigint
          category: string
          createdAt: bigint
        }
        return {
          question: market.question,
          outcomes: market.outcomes,
          prices: market.prices.map(p => Number(p)),
          totalLiquidity: Number(market.totalLiquidity),
          endTime: Number(market.endTime),
          resolved: market.resolved,
          winningOutcome: Number(market.winningOutcome),
          category: market.category,
          createdAt: Number(market.createdAt),
        }
      } catch (error) {
        logger.error('Error getting market:', error, 'useContracts')
        return null
      }
    },

    getMarketPrice: async (marketId: `0x${string}`, outcome: number) => {
      if (!contracts || !contracts.read.predictionMarket.read.getMarketPrice) return 0
      try {
        const price = await contracts.read.predictionMarket.read.getMarketPrice([
          marketId,
          BigInt(outcome),
        ]) as bigint
        return Number(price)
      } catch (error) {
        logger.error('Error getting market price:', error, 'useContracts')
        return 0
      }
    },

    getUserPosition: async (marketId: `0x${string}`, userAddress: Address) => {
      if (!contracts || !contracts.read.predictionMarket.read.getUserPosition) return null
      try {
        const position = await contracts.read.predictionMarket.read.getUserPosition([
          marketId,
          userAddress,
        ]) as {
          shares: bigint[]
          totalInvested: bigint
          claimed: boolean
        }
        return {
          shares: position.shares.map(s => Number(s)),
          totalInvested: Number(position.totalInvested),
          claimed: position.claimed,
        }
      } catch (error) {
        logger.error('Error getting user position:', error, 'useContracts')
        return null
      }
    },

    getActiveMarkets: async () => {
      if (!contracts || !contracts.read.predictionMarket.read.getActiveMarkets) return []
      try {
        const markets = await contracts.read.predictionMarket.read.getActiveMarkets() as `0x${string}`[]
        return markets
      } catch (error) {
        logger.error('Error getting active markets:', error, 'useContracts')
        return []
      }
    },

    getMarketsByCategory: async (category: string) => {
      if (!contracts || !contracts.read.predictionMarket.read.getMarketsByCategory) return []
      try {
        const markets = await contracts.read.predictionMarket.read.getMarketsByCategory([category]) as `0x${string}`[]
        return markets
      } catch (error) {
        logger.error('Error getting markets by category:', error, 'useContracts')
        return []
      }
    },

    // Write operations (requires wallet connection)
    createMarket: async (
      question: string,
      outcomes: string[],
      endTime: number,
      category: string
    ) => {
      if (!contracts?.write || !contracts.write.predictionMarket.write.createMarket) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.predictionMarket.write.createMarket([
          question,
          outcomes,
          BigInt(endTime),
          category,
        ]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error creating market:', error, 'useContracts')
        throw error
      }
    },

    buyShares: async (marketId: `0x${string}`, outcome: number, amount: bigint) => {
      if (!contracts?.write || !contracts.write.predictionMarket.write.buyShares) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.predictionMarket.write.buyShares(
          [marketId, BigInt(outcome), amount],
          { value: amount }
        ) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error buying shares:', error, 'useContracts')
        throw error
      }
    },

    sellShares: async (marketId: `0x${string}`, outcome: number, amount: number) => {
      if (!contracts?.write || !contracts.write.predictionMarket.write.sellShares) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.predictionMarket.write.sellShares([
          marketId,
          BigInt(outcome),
          BigInt(amount),
        ]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error selling shares:', error, 'useContracts')
        throw error
      }
    },

    claimWinnings: async (marketId: `0x${string}`) => {
      if (!contracts?.write || !contracts.write.predictionMarket.write.claimWinnings) {
        throw new Error('Wallet not connected')
      }
      try {
        const hash = await contracts.write.predictionMarket.write.claimWinnings([marketId]) as `0x${string}`
        return hash
      } catch (error) {
        logger.error('Error claiming winnings:', error, 'useContracts')
        throw error
      }
    },

    isDeployed,
    address,
  }
}
