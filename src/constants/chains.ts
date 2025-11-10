import { base, baseSepolia } from 'viem/chains';

type Network = 'mainnet' | 'testnet';

const rawNetwork = process.env.NEXT_PUBLIC_CHAIN_TYPE;

const envNetwork =
  rawNetwork === undefined || rawNetwork === null || rawNetwork.trim() === ''
    ? 'testnet'
    : (rawNetwork.trim().toLowerCase() as Network);

const resolveChain = () => {
  switch (envNetwork) {
    case 'testnet':
      return baseSepolia;
    case 'mainnet':
    default:
      return base;
  }
};

export const NETWORK: Network = envNetwork;
export const CHAIN = resolveChain();
export const CHAIN_ID = CHAIN.id;
