# Benchmark System - Ready to Use

## Quick Start

```bash
# Run the master benchmark script
bun run scripts/benchmark.ts <command>

# Commands:
  setup      - Create test agents (run once)
  quick      - 2-min quick test
  compare    - Compare models (supports any models from registry)
  baselines  - Run full week baselines
  verify     - Check system health

# View and analyze results
bun run scripts/benchmark-results.ts <command>

# Commands:
  list       - List all available benchmark results
  view       - View a specific benchmark result
  compare    - Compare models in a directory (with charts)
  report     - Generate HTML report with interactive charts
  history    - Show historical benchmark trends
```

## New Features ✨

- **Model Registry**: Centralized configuration for all models (`src/lib/benchmark/ModelRegistry.ts`)
- **Interactive Charts**: HTML reports with Chart.js visualizations
- **Terminal Charts**: ASCII charts for quick CLI viewing
- **Historical Tracking**: Database persistence for trend analysis
- **Flexible Comparisons**: Compare any models, not just hardcoded ones

## Available Benchmarks

| File | Duration | Ticks | Use For |
|------|----------|-------|---------|
| `benchmark-week-10080-60-10-5-8-12345.json` | 1 week | 10,080 | Production baselines |
| `benchmark-week-30-60-10-5-8-12345.json` | 30 min | 30 | Quick comparison |
| `benchmark-week-5-10-3-2-5-99999.json` | 5 min | 12 | Rapid testing |

## Current Baselines

**30-Minute Benchmark Results:**

| Model | P&L | Accuracy | Perp Trades | Winner |
|-------|-----|----------|-------------|--------|
| LLaMA 8B Instant | -$675 | 39.3% | 2 (50% win) | |
| Qwen 32B | -$77 | 48.3% | 1 (0% win) | ✅ |

🏆 **Winner: Qwen 32B** ($598 better P&L, 9% higher accuracy)

Baselines saved in `baselines/` directory.

## Integration

**Automated:** Benchmarking runs automatically after every model training  
**Configuration:** `config/rl-pipeline.yaml` (all flags enabled)  
**Results:** Stored in database + file system

## Documentation

Full guides available:
- `../docs/BENCHMARK_WORKFLOWS.md` - Manual commands
- `../docs/BENCHMARK_AUTOMATION.md` - Automated integration  
- `../BENCHMARK_COMPLETE.md` - Complete technical guide
- `../BENCHMARK_SYSTEM_FINAL.md` - Final integration summary

## Model Registry

All available models are configured in `src/lib/benchmark/ModelRegistry.ts`. To add a new model:

```typescript
{
  id: 'my-model',
  displayName: 'My Model',
  provider: 'groq',
  modelId: 'my-model-id',
  tier: 'standard',
  isBaseline: false,
}
```

Then use it:
```bash
bun run scripts/compare-models.ts --models=my-model,llama-8b
```

## Visualization

### Terminal Charts
```bash
bun run scripts/benchmark-results.ts compare benchmarks/model-comparison
```
Shows ASCII charts directly in terminal.

### HTML Reports
```bash
bun run scripts/benchmark-results.ts report benchmarks/model-comparison
```
Generates interactive HTML report with:
- P&L comparison charts
- Accuracy visualization
- Perpetual trading metrics
- Response time analysis
- Detailed comparison tables

Open the generated HTML file in your browser for full interactivity.

## Historical Tracking

Benchmark results are automatically saved to the database (`benchmark_results` table) for:
- Trend analysis over time
- Model improvement tracking
- Baseline comparisons
- Performance regression detection

Query historical data:
```bash
bun run scripts/benchmark-results.ts history
```

## System Status

✅ **100% Complete and Operational**
- LLM-based decision making working
- Both prediction and perpetual trading supported
- Metrics mathematically verified
- Fully integrated with continuous RL pipeline
- **NEW**: Model registry for flexible comparisons
- **NEW**: Interactive charts and visualizations
- **NEW**: Historical tracking and trend analysis
- Production-ready

Last updated: November 25, 2025
