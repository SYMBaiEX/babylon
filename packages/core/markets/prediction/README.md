# Prediction markets (core)

Purpose: domain service for offchain prediction markets (CPMM).

Include:
- CPMM pricing (yes/no), optional concentrated liquidity if adopted.
- `PredictionMarketService`: init market, buy/sell (AMM + fees), resolve/payout, snapshots/trades/broadcast, cache invalidation via ports.
- Required ports: DB (markets/positions/history), Wallet, Fees config, Broadcast, Cache, Clock, Onchain (future).

Steps:
1) Define DTOs (buy/sell/resolve).
2) Reuse `prediction-pricing` (move/copy here).
3) Move resolution/payout from tick/handlers into the service.
4) Adapt Next handlers to call this service.
