# Environment Variables

Create a `.env` file with the following content:

```bash
# Babylon Python Agent Configuration

# Agent wallet private key (uses anvil test account 1)
AGENT0_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# A2A Server URL
BABYLON_A2A_URL=http://localhost:3001

# Agent Configuration
AGENT_NAME=Python Agent
AGENT_DESCRIPTION=Autonomous Python trading agent
AGENT_STRATEGY=balanced
TICK_INTERVAL=10

# LLM Configuration (optional)
# GROQ_API_KEY=your_groq_api_key

# Chain Configuration
CHAIN_ID=31337
```

## Test Wallets (from Anvil)

| Account | Address | Private Key |
|---------|---------|-------------|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
