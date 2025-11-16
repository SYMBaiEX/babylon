# Benchmark System - Ready to Use

## Quick Start

```bash
# Run the master benchmark script
bun run scripts/benchmark.ts <command>

# Commands:
  setup      - Create test agents (run once)
  quick      - 2-min quick test
  compare    - Compare LLaMA 8B vs Qwen 32B
  baselines  - Run full week baselines
  verify     - Check system health
```

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

## System Status

✅ **100% Complete and Operational**
- LLM-based decision making working
- Both prediction and perpetual trading supported
- Metrics mathematically verified
- Fully integrated with continuous RL pipeline
- Production-ready

Last validated: November 16, 2025
