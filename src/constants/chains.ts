/**
 * Blockchain Chain Configuration
 * 
 * Configures the blockchain network (Base, Ethereum, Sepolia, Base Sepolia)
 * based on environment variables. Provides chain constants and RPC URL.
 */

import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

const rawChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);

/**
 * Resolves the chain configuration based on NEXT_PUBLIC_CHAIN_ID environment variable.
 * 
 * @returns Configured chain object (defaults to Base Sepolia if no match)
 */
const resolveChain = () => {
  if (rawChainId === base.id) return base;
  if (rawChainId === mainnet.id) return mainnet;
  if (rawChainId === sepolia.id) return sepolia;
  return baseSepolia;
};

/**
 * Active blockchain chain configuration.
 * Determined from NEXT_PUBLIC_CHAIN_ID environment variable.
 */
export const CHAIN = resolveChain();

/**
 * Active chain ID (numeric identifier).
 * Derived from the configured CHAIN.
 */
export const CHAIN_ID = CHAIN.id;

/**
 * Network type classification.
 * 'mainnet' for Base/Ethereum mainnet, 'testnet' for Sepolia/Base Sepolia.
 */
export const NETWORK: 'mainnet' | 'testnet' =
  CHAIN_ID === base.id || CHAIN_ID === mainnet.id ? 'mainnet' : 'testnet';

const DEFAULT_RPC = CHAIN.rpcUrls?.default?.http?.[0] ?? '';

/**
 * RPC URL for blockchain interactions.
 * Uses NEXT_PUBLIC_RPC_URL if provided, otherwise falls back to chain's default RPC.
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL &&
  process.env.NEXT_PUBLIC_RPC_URL.trim() !== ''
    ? process.env.NEXT_PUBLIC_RPC_URL
    : DEFAULT_RPC;
