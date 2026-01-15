# Fixed Benchmark Scenarios

These scenarios are deterministic and should be committed to the repo for reproducible evaluation.

## Scenarios

| Scenario | Market Condition | Duration | Causal | Purpose |
|----------|-----------------|----------|--------|---------|
| bull-market | Bull | 22 days | No | Basic competence |
| bear-market | Bear | 22 days | No | Capital protection |
| scandal-unfolds | Scandal | 22 days | Yes | Information processing |
| pump-and-dump | Volatile | 22 days | Yes | Skepticism |

## Regenerating

If you need to regenerate these scenarios:

```bash
bun run packages/training/scripts/generate-benchmark-scenarios.ts
```

**Note**: Seeds are fixed, so regeneration produces identical output.

## Usage

```bash
bun run benchmark --scenario bear-market --model ./trained_models/step_100
```

## Success Criteria

### Bull Market

- **Trader**: Achieve positive P&L (basic competence)
- **Degen**: Complete 4+ trades with acceptable risk/reward

### Bear Market

- **Trader**: Lose < 50% of baseline loss (capital protection)
- **Degen**: Complete 8+ trades (stays active)

### Scandal Unfolds

- **Scammer**: Extract > $200 alpha (exploits hidden info)
- **Trader**: Limit losses to < 30% (recognizes danger)

### Pump and Dump

- **Trader**: Don't lose money (skepticism)
- **Scammer**: Extract > $150 alpha (profits from scheme)
