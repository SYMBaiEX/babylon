# BAB-148 — Profile: Agent Availability and P/L Detail

## Context
- Users report that allocating points to agents shows up as a negative in P/L, which is confusing and likely incorrect.
- The app needs a consistent P/L computation everywhere (Profile, Dashboard, and any other surface).

## What This Issue Contains
- **Bug**: P/L sign / calculation becomes negative when agent points are allocated (likely treating transfers as losses).
- **Feature/UX**: Add a detailed P/L breakdown on Profile.
- **Consistency/Refactor**: Ensure the same P/L formula is used across the entire app.
- **Small enhancement**: Add a “My Agents” count in the Profile stats section.

## Requested P/L Breakdown (Profile)
Show a breakdown with:
1. **Available** — available balance
2. **In Positions** — value in open positions
3. **Agents** — value/assets in agents
4. **Wallet** — wallet balance

## Requested Global P/L Formula
`Total P/L = (Agents + Positions + Wallet) - Original Amount`

## Open Questions / Definitions (Must Clarify During Audit)
- **Available vs Wallet**: are these distinct buckets or overlapping (risk of double-counting)?
- **Agents valuation**: what is “Agents” exactly (points, assets, equity, AUM, mark-to-market)?
- **Positions valuation**: what is “Positions” exactly (open positions only, mark-to-market, fees included)?
- **Original Amount**: starting capital definition (initial deposit vs net deposits vs fixed baseline at a date)?
- **Transfers vs P/L**: agent point allocation should likely move value between buckets, not change total assets.

## Audit Checklist (Code)
- Locate all P/L calculations and displays:
  - Profile page
  - Dashboard
  - Any other widgets/components/APIs returning P/L
- Identify the current data sources for:
  - Wallet balance
  - Available balance
  - Positions value
  - Agents value
  - Original amount / baseline
- Verify whether the “minus when giving points” is:
  - A sign error
  - A double-counting issue
  - A bucket mapping issue (transfer treated as spend)

## Current Code Findings (Initial)
### Where user P/L is computed today (inconsistent)
- Profile widget uses **portfolio value - net contributions**:
  - `apps/web/src/components/profile/ProfileWidget.tsx`
- Trading profile uses **lifetimePnL + unrealizedPnL**:
  - `apps/web/src/components/profile/TradingProfile.tsx`
- Markets dashboard uses `usePortfolioPnL()` (lifetime + unrealized), then renders `PortfolioPnLCard`:
  - `apps/web/src/hooks/usePortfolioPnL.ts`
  - `apps/web/src/components/markets/PortfolioPnLCard.tsx`
  - `apps/web/src/app/markets/_hooks/useMarketsPageData.ts`
- OG P&L image uses server-side `calculatePortfolioPnL()` (lifetime + unrealized):
  - `apps/web/src/app/api/og/pnl/[userId]/route.tsx`
  - `packages/engine/src/services/portfolio-pnl.ts`

### Likely root cause of “P/L goes negative when funding agents”
- Funding agents debits the manager’s `users.virtualBalance`, and credits the agent’s `users.virtualBalance`.
- User portfolio views typically **don’t include agent-held assets**, so “total assets” appears to drop.
- Canonical transfer code:
  - `packages/agents/src/services/AgentService.ts` (`depositTradingBalance`, `withdrawTradingBalance`)

### “My Agents” count source of truth
- Owned agents are `users.isAgent = true` and `users.managedBy = <managerUserId>`.
- Listing agents (owner-only):
  - `packages/agents/src/services/AgentService.ts` (`listUserAgents`)
  - `apps/web/src/app/api/agents/route.ts` (GET)

## Implementation TODO (High-Level)
1. Define canonical P/L model and formula in a shared package (single source of truth).
2. Implement breakdown values (Available / Positions / Agents / Wallet) from canonical sources.
3. Update Profile UI to render the breakdown + total P/L.
4. Add “My Agents” count in Profile stats.
5. Replace all other P/L computations to use the same canonical function.
6. Add tests (unit/integration as appropriate) to lock formula consistency.

## Acceptance Criteria
- Allocating points to agents does **not** cause a confusing negative P/L if total assets are unchanged.
- Profile shows the requested breakdown and total P/L using the global formula.
- Dashboard and any other P/L display matches the same formula exactly.
- “My Agents” count appears on Profile stats and updates correctly.
