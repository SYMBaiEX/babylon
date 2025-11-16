/**
 * Chain Configuration Constants
 * 
 * @module constants/chains
 * 
 * @description
 * Provides blockchain network configuration for Babylon, dynamically resolving
 * the target chain from environment variables. Supports Base, Ethereum mainnet,
 * and their testnets (Sepolia, Base Sepolia).
 * 
 * The configuration is determined at build time from `NEXT_PUBLIC_CHAIN_ID` and
 * provides type-safe access to chain metadata, RPC URLs, and network detection.
 * 
 * **Supported Chains:**
 * - **Base** (8453): Production on Base L2
 * - **Base Sepolia** (84532): Default testnet
 * - **Ethereum Mainnet** (1): Ethereum L1
 * - **Sepolia** (11155111): Ethereum testnet
 * 
 * @example
 * ```typescript
 * import { CHAIN, CHAIN_ID, NETWORK, RPC_URL } from '@/constants/chains'
 * 
 * console.log(`Running on ${CHAIN.name} (${CHAIN_ID})`)
 * console.log(`Network: ${NETWORK}`) // 'mainnet' or 'testnet'
 * console.log(`RPC: ${RPC_URL}`)
 * ```
 */

import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

/**
 * Raw chain ID from environment variable
 * @internal
 */
const rawChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);

/**
 * Resolves the target blockchain from chain ID
 * 
 * @internal
 * @returns Viem chain configuration object
 * 
 * @description
 * Maps NEXT_PUBLIC_CHAIN_ID to the appropriate viem chain configuration.
 * Defaults to Base Sepolia if chain ID is invalid or not recognized.
 */
const resolveChain = () => {
  if (rawChainId === base.id) return base;
  if (rawChainId === mainnet.id) return mainnet;
  if (rawChainId === sepolia.id) return sepolia;
  return baseSepolia;
};

/**
 * Current blockchain configuration
 * 
 * @constant CHAIN
 * @type {Chain}
 * 
 * @description
 * Viem chain object containing network metadata, block explorers, RPC URLs,
 * and native currency information for the configured blockchain.
 * 
 * @example
 * ```typescript
 * console.log(CHAIN.name) // 'Base'
 * console.log(CHAIN.nativeCurrency.symbol) // 'ETH'
 * console.log(CHAIN.blockExplorers?.default.url) // 'https://basescan.org'
 * ```
 */
export const CHAIN = resolveChain();

/**
 * Current blockchain chain ID
 * 
 * @constant CHAIN_ID
 * @type {number}
 * 
 * @description
 * EIP-155 chain ID for the current blockchain.
 * Used for transaction signing and network identification.
 * 
 * @example
 * ```typescript
 * if (CHAIN_ID === 8453) {
 *   console.log('Running on Base mainnet')
 * }
 * ```
 */
export const CHAIN_ID = CHAIN.id;

/**
 * Network type (mainnet or testnet)
 * 
 * @constant NETWORK
 * @type {'mainnet' | 'testnet'}
 * 
 * @description
 * High-level network classification. Mainnet includes Base and Ethereum mainnet.
 * Testnet includes Base Sepolia and Sepolia.
 * 
 * @example
 * ```typescript
 * if (NETWORK === 'testnet') {
 *   console.log('Running on testnet - use test tokens')
 * }
 * ```
 */
export const NETWORK: 'mainnet' | 'testnet' =
  CHAIN_ID === base.id || CHAIN_ID === mainnet.id ? 'mainnet' : 'testnet';

/**
 * Default RPC URL from chain configuration
 * @internal
 */
const DEFAULT_RPC = CHAIN.rpcUrls?.default?.http?.[0] ?? '';

/**
 * RPC endpoint URL for blockchain communication
 * 
 * @constant RPC_URL
 * @type {string}
 * 
 * @description
 * JSON-RPC endpoint for interacting with the blockchain. Can be customized via
 * `NEXT_PUBLIC_RPC_URL` environment variable to use private RPC providers
 * (e.g., Alchemy, Infura). Falls back to chain's default public RPC.
 * 
 * @example
 * ```typescript
 * // Use custom RPC
 * // .env: NEXT_PUBLIC_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
 * 
 * const client = createPublicClient({
 *   chain: CHAIN,
 *   transport: http(RPC_URL)
 * })
 * ```
 * 
 * @remarks
 * - Custom RPC URLs should be set in environment variables for security
 * - Default public RPCs may have rate limits
 * - Production deployments should use dedicated RPC providers
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL &&
  process.env.NEXT_PUBLIC_RPC_URL.trim() !== ''
    ? process.env.NEXT_PUBLIC_RPC_URL
    : DEFAULT_RPC;
