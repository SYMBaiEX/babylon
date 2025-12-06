# Environment Variables

Create a `.env.local` file with the following content:

```bash
# Babylon A2A Example Agent Configuration

# Agent wallet private key (uses anvil test account 0 by default)
AGENT0_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# A2A Server URL
# For local development:
BABYLON_API_URL=http://localhost:3001
# For production Babylon:
# BABYLON_API_URL=http://localhost:3000

# Agent Configuration
AGENT_NAME=Demo Agent
AGENT_DESCRIPTION=Autonomous trading agent for Babylon
AGENT_STRATEGY=balanced
TICK_INTERVAL=10000

# LLM Configuration (optional - agent will work without but use random decisions)
# At least one is recommended for intelligent decision making
# GROQ_API_KEY=your_groq_api_key
# ANTHROPIC_API_KEY=your_anthropic_api_key
# OPENAI_API_KEY=your_openai_api_key

# Chain Configuration (for local anvil)
CHAIN_ID=31337
RPC_URL=http://localhost:8545

# API Key (for production Babylon server)
# BABYLON_A2A_API_KEY=your_api_key
```

## Test Wallets (from Anvil)

These are the default test accounts with 10000 ETH each:

| Account | Address | Private Key |
|---------|---------|-------------|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
