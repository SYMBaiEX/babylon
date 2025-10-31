# Babylon Blockchain Integration

ERC-8004 agent identity and reputation system on Base L2, integrated with prediction markets.

## Architecture

### Smart Contracts (Base L2)

- **Identity Registry (ERC-8004)**: NFT-based agent identities with on-chain profiles
- **Reputation System (ERC-8004)**: On-chain reputation tracking for agents
- **Diamond Proxy**: Upgradeable contract pattern for prediction markets
  - **PredictionMarketFacet**: AMM-based prediction markets
  - **OracleFacet**: Oracle integration (Chainlink/UMA)

### Web3 Integration Layer

- **wagmi**: React hooks for Ethereum interactions
- **viem**: Low-level TypeScript Ethereum library
- **Privy**: Wallet authentication (MetaMask, Rabby, WalletConnect, email)

## File Structure

```
src/lib/web3/
├── contracts.ts       # Contract addresses and configuration
├── abis.ts           # Contract ABIs (Application Binary Interface)
└── README.md         # This file

src/hooks/
└── useContracts.ts   # React hooks for contract interactions
  ├── useContracts()          # Main hook for contract instances
  ├── useAgentRegistry()      # Agent registration and profile management
  ├── useReputation()         # Reputation queries and feedback
  └── usePredictionMarket()   # Market trading and queries

src/lib/
└── privy-config.ts   # Privy + wagmi configuration with Base L2 support
```

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Chain Configuration
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia testnet
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret

# Deployment (for contract deployment only)
DEPLOYER_PRIVATE_KEY=0x...
BASE_SEPOLIA_ETHERSCAN_API_KEY=your_api_key
```

### 2. Deploy Smart Contracts

```bash
# Compile contracts
bun run contracts:compile

# Deploy to Base Sepolia testnet
DEPLOYER_PRIVATE_KEY=0x... bun run contracts:deploy:testnet

# Deploy to Base mainnet (when ready)
NETWORK=base DEPLOYER_PRIVATE_KEY=0x... bun run contracts:deploy:mainnet
```

After deployment, the script saves addresses to `deployments/base-sepolia.json` or `deployments/base.json`.

### 3. Update Environment with Deployed Addresses

Copy addresses from deployment JSON to `.env`:

```bash
# Base Sepolia Contract Addresses
NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA=0x...
NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA=0x...
NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA=0x...
```

## Usage

### Check Wallet Connection

```tsx
import { useAccount } from 'wagmi'

function MyComponent() {
  const { address, isConnected } = useAccount()

  return (
    <div>
      {isConnected ? `Connected: ${address}` : 'Not connected'}
    </div>
  )
}
```

### Register an Agent

```tsx
import { useAgentRegistry } from '@/hooks/useContracts'

function RegisterAgent() {
  const { registerAgent, isDeployed } = useAgentRegistry()

  const handleRegister = async () => {
    if (!isDeployed) {
      alert('Contracts not deployed yet')
      return
    }

    try {
      const hash = await registerAgent(
        'Alice Trader',                    // name
        'https://agent.example.com/alice', // endpoint
        '0x1234....',                      // capabilities hash
        'ipfs://...'                       // metadata URI
      )
      console.log('Transaction hash:', hash)
    } catch (error) {
      console.error('Failed to register:', error)
    }
  }

  return <button onClick={handleRegister}>Register Agent</button>
}
```

### Query Agent Reputation

```tsx
import { useReputation } from '@/hooks/useContracts'
import { useEffect, useState } from 'react'

function AgentReputation({ tokenId }: { tokenId: number }) {
  const { getReputation } = useReputation()
  const [reputation, setReputation] = useState(null)

  useEffect(() => {
    getReputation(tokenId).then(setReputation)
  }, [tokenId])

  if (!reputation) return <div>Loading...</div>

  return (
    <div>
      <p>Trust Score: {reputation.trustScore}</p>
      <p>Accuracy: {reputation.accuracyScore}%</p>
      <p>Total Bets: {reputation.totalBets}</p>
      <p>Win Rate: {(reputation.winningBets / reputation.totalBets * 100).toFixed(1)}%</p>
    </div>
  )
}
```

### Buy Prediction Market Shares

```tsx
import { usePredictionMarket } from '@/hooks/useContracts'
import { parseEther } from 'viem'

function BuyShares({ marketId }: { marketId: `0x${string}` }) {
  const { buyShares } = usePredictionMarket()

  const handleBuy = async () => {
    try {
      const hash = await buyShares(
        marketId,
        0,                      // outcome index
        parseEther('0.1')      // 0.1 ETH worth of shares
      )
      console.log('Transaction hash:', hash)
    } catch (error) {
      console.error('Failed to buy shares:', error)
    }
  }

  return <button onClick={handleBuy}>Buy Shares (0.1 ETH)</button>
}
```

## Contract ABIs

ABIs are defined in `src/lib/web3/abis.ts`:

- `IDENTITY_REGISTRY_ABI`: Agent registration, profile management
- `REPUTATION_SYSTEM_ABI`: Reputation queries, feedback submission
- `PREDICTION_MARKET_ABI`: Market creation, trading, resolution
- `ORACLE_ABI`: Oracle management, data requests

## Network Support

### Base Sepolia (Testnet)
- Chain ID: 84532
- RPC: https://sepolia.base.org
- Explorer: https://sepolia.basescan.org
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

### Base (Mainnet)
- Chain ID: 8453
- RPC: https://mainnet.base.org
- Explorer: https://basescan.org

## Security Considerations

1. **Private Keys**: NEVER commit `.env` with real private keys
2. **Contract Verification**: Always verify contracts on block explorer
3. **Testing**: Test thoroughly on testnet before mainnet deployment
4. **Upgrades**: Use Diamond pattern for safe contract upgrades
5. **Access Control**: Ensure only authorized addresses can update reputation

## Troubleshooting

### Wallet Not Connecting

1. Check Privy App ID is correct in `.env`
2. Ensure WalletConnect Project ID is set
3. Try different wallet (MetaMask, Rabby, etc.)

### Contract Calls Failing

1. Verify contracts are deployed: check `deployments/` folder
2. Ensure `.env` has correct contract addresses
3. Check you're on the correct network (Base Sepolia vs. Mainnet)
4. Verify you have enough ETH for gas fees

### Transaction Reverts

1. Check contract is not paused
2. Verify you have permission for the operation
3. Ensure input parameters are valid
4. Check gas limit is sufficient

## Next Steps

1. ✅ Deploy contracts to Base Sepolia testnet
2. ✅ Update environment with deployed addresses
3. ⏳ Create agent registration UI
4. ⏳ Build reputation dashboard
5. ⏳ Integrate prediction markets with blockchain
6. ⏳ Add transaction history and explorer

## Resources

- [ERC-8004 Standard](https://eips.ethereum.org/EIPS/eip-8004)
- [Base L2 Documentation](https://docs.base.org)
- [Privy Documentation](https://docs.privy.io)
- [wagmi Documentation](https://wagmi.sh)
- [viem Documentation](https://viem.sh)
