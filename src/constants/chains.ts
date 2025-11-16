import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

const rawChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);

const resolveChain = () => {
  if (rawChainId === base.id) return base;
  if (rawChainId === mainnet.id) return mainnet;
  if (rawChainId === sepolia.id) return sepolia;
  return baseSepolia;
};

export const CHAIN = resolveChain();
export const CHAIN_ID = CHAIN.id;
export const NETWORK: 'mainnet' | 'testnet' =
  CHAIN_ID === base.id || CHAIN_ID === mainnet.id ? 'mainnet' : 'testnet';
const DEFAULT_RPC = CHAIN.rpcUrls?.default?.http?.[0] ?? '';
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL &&
  process.env.NEXT_PUBLIC_RPC_URL.trim() !== ''
    ? process.env.NEXT_PUBLIC_RPC_URL
    : DEFAULT_RPC;
