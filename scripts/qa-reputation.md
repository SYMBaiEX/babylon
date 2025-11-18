# QA Checklist – Reputation Surfaces

## API
- [ ] `/api/reputation/{userId}` returns metrics for both agents and regular users (including auto-created metrics).
- [ ] `/api/registry/all` includes `reputationScore`, `trustLevel`, `averageFeedbackScore` from `AgentPerformanceMetrics` (no reliance on `reputationPoints`).
- [ ] `/api/reputation/breakdown/{userId}` shows the updated 40/40/20 split with win-rate + intel components.

## UI
- [ ] `/reputation` page displays the composite score, wins/losses, win rate, and trust level for a user with data.
- [ ] `/reputation` page handles the "no NFT yet" state gracefully (non-onboarded user).
- [ ] Any registry/leaderboard view connected to `/api/registry` shows consistent scores.

## Scripts / Docs
- [ ] `scripts/backfill-agent-performance-metrics.ts --dry-run` lists missing users (if any) without modifying data.
- [ ] Documentation (`docs/reputation-reference.md`) reflects the new formula, bootstrap process, and agent→game endpoint.
