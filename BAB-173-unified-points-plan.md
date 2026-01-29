# BAB-173: Unified Points System — Implementation Plan

## Goal
One number ("Total Points") displayed consistently everywhere. Three separate concepts:
- **Total Points** = wallet + positions (portfolio value, excludes agents)
- **PnL** = realized + unrealized (skill metric, for ranking)
- **Reputation** = badge/score (earned + invite + bonus, kept separate)

---

## Phase 1: DB Migration

**Files:**
- `packages/db/src/schema/users.ts` — add `totalPoints` decimal(18,2) column
- `packages/db/src/migrations/` — new migration: add column + create `user_points_snapshots` table (userId, totalPoints, snapshotDate, period)
- One-time backfill script for existing users

---

## Phase 2: Backend — Portfolio Breakdown

**Files:**
- `packages/engine/src/services/portfolio-breakdown.ts`
  - Add `totalPoints: wallet + positions` to return shape (exclude agents)
  - Keep `totalAssets` unchanged (includes agents, for portfolio view)
- `packages/engine/src/services/wallet-service.ts`
  - After credit/debit, trigger `users.totalPoints` recompute
- **New:** `packages/engine/src/services/total-points-service.ts`
  - `recomputeTotalPoints(userId)` — fetches wallet + open position values, writes to `users.totalPoints`
  - `snapshotAllUsers()` — batch job for daily/weekly snapshots

---

## Phase 3: Backend — Leaderboard

**Files:**
- `packages/api/src/services/points-service.ts`
  - Add `pointsCategory = 'total'` mode, sorts by `users.totalPoints`
  - Exclude `isAgent=true` users from ALL leaderboard modes
  - Exclude actors from 'total' mode
- `apps/web/src/app/api/leaderboard/route.ts`
  - Add `pointsType=total` param, make it the default
  - Keep existing modes for backwards compat
  - Adjust minPoints threshold for totalPoints context
- `apps/web/src/app/api/users/[userId]/portfolio-breakdown/route.ts`
  - Expose `totalPoints` in response

---

## Phase 4: Frontend — Leaderboard

**Files:**
- `apps/web/src/app/leaderboard/page.tsx`
  - Default tab → "Total Points" (new)
  - Keep "Earned" and "Referral" as secondary tabs
  - Add "Daily Gain" / "Weekly Gain" filter (uses snapshot data)
  - Update `LeaderboardUser` interface: add `totalPoints`
- `apps/web/src/components/leaderboard/LeaderboardWidgetSidebar.tsx`
  - Show Total Points as primary metric
  - Show breakdown: wallet / positions
  - Keep PnL display

---

## Phase 5: Frontend — Profile & Rewards

**Files:**
- `apps/web/src/components/profile/ProfileWidget.tsx`
  - Show "Total Points" prominently
  - Breakdown: wallet pts, position pts
  - Keep P&L and Total Assets as separate displays
- `apps/web/src/components/shared/PlayerStatsModal.tsx`
  - Replace "Reputation" with "Total Points" as primary
  - Move Reputation to a badge/secondary display
  - Keep Balance, Lifetime PnL, Referrals
- `apps/web/src/app/rewards/page.tsx`
  - "Current Balance" → show Total Points (not reputationPoints)
  - Add trading PnL section to "Total Earned" or rename to "Bonus Points Earned"
- `apps/web/src/stores/authStore.ts`
  - Add `totalPoints` field to User interface
- `apps/web/src/hooks/usePortfolioPnL.ts`
  - Expose `totalPoints` from portfolio-breakdown response

---

## Phase 6: Snapshot Job

- Cron/scheduled job: recompute `users.totalPoints` for all active users (every 15min)
- Daily snapshot: write to `user_points_snapshots` at midnight UTC
- Weekly gain = current totalPoints − snapshot from 7 days ago
- Safety net: nightly full recompute to fix any drift

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| `totalPoints` stored on users table | Fast leaderboard sorting (indexed column) |
| Agents excluded from leaderboard | They are separate accounts |
| Actors excluded from "total" mode | Only real users in total points ranking |
| `totalPoints` = wallet + positions only | No agents — agents are separate accounts |
| Reputation stays as-is | Moves to badge/secondary display |
| Existing API params preserved | Backwards compatibility |

---

## Verification Checklist

- [ ] Run DB migration, verify column exists + backfill
- [ ] `GET /api/users/{id}/portfolio-breakdown` — confirm `totalPoints` field
- [ ] `GET /api/leaderboard?pointsType=total` — confirm ranked by totalPoints, no agents
- [ ] Leaderboard UI — default tab is Total Points
- [ ] ProfileWidget — shows Total Points + breakdown
- [ ] PlayerStatsModal — shows Total Points, Reputation as badge
- [ ] Rewards page — shows Total Points as balance
- [ ] Daily/weekly gain displays after snapshot job runs
- [ ] Typecheck all packages: `npx turbo typecheck`

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Backfill needed for all existing users | One-time computation script |
| Drift if wallet/position changes miss recompute | 15min cron + nightly full recompute |
| Leaderboard perf | Indexed `totalPoints` column = fast sort |
| minPoints threshold recalibration | 500 reputation ≠ 500 totalPoints — needs tuning |
| API consumers | Existing `pointsType=all` behavior unchanged |
