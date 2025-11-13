# Scripts Directory

## Oracle Testing Scripts

### Quick Validation
```bash
bun run oracle:validate
```
Validates entire integration in ~2 seconds.

### Simple Health Check
```bash
bun run oracle:test:simple
```
Bash script that checks:
- Anvil running
- Contracts deployed
- Oracle accessible
- Statistics readable

### E2E Test
```bash
bun run oracle:test:e2e
```
TypeScript script that runs complete flow:
1. Creates question
2. Commits to oracle
3. Resolves question
4. Reveals on oracle
5. Verifies external readability

### Solidity Tests
```bash
bun run contracts:test:oracle
```
Runs 9 comprehensive Solidity tests.

## Deployment Scripts

### Localnet
```bash
bun run contracts:deploy:local
```

### Testnet
```bash
bun run deploy:testnet
```

### Mainnet
```bash
export USE_MAINNET=true
bun run deploy:mainnet
```

## All Oracle Commands

```bash
# Validation
bun run oracle:validate           # Validate integration

# Testing
bun run oracle:test:simple        # Quick check
bun run oracle:test:e2e           # Full E2E test  
bun run oracle:test:integration   # Integration tests
bun run contracts:test:oracle     # Solidity tests (9 tests)

# Deployment
bun run contracts:deploy:local    # Deploy to localnet
bun run deploy:testnet            # Deploy to testnet
bun run deploy:mainnet            # Deploy to mainnet
```

See individual script files for details.

