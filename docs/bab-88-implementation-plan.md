# BAB-88: Daily Login Rewards & Streak System - Implementation Plan

## 1. Goal Clarification

### What We're Building
A **daily login rewards and streak system** that:
- Tracks consecutive daily logins (streaks)
- Awards escalating daily rewards (Day 1: 50pts → Day 7: 200pts + 500pt bonus)
- Provides milestone bonuses (7, 14, 30, 60, 90 days)
- Includes a 36-hour grace period to maintain streaks (forgiving window)
- Redesigns the rewards page to prioritize daily rewards as the hero feature
- Moves one-time onboarding tasks to the bottom

### Why We're Building It
- **Problem**: Current rewards page focuses on one-time onboarding tasks rather than ongoing engagement
- **Solution**: Transform rewards page into a game-focused engagement driver with daily streaks as the MVP
- **Impact**: Increase daily active users (DAU) and user retention through gamified daily engagement

### Scope
- **MVP (This Ticket)**: Daily login tracking, streak system, escalating rewards, milestone bonuses, grace period, rewards page redesign
- **Future (Out of Scope)**: Gamified badges (trading, posting, group chat, follower badges), streak freeze feature

---

## 2. Constraints

### Platform & Technical
- **Framework**: Next.js 14+ (App Router) with TypeScript ESM
- **Database**: PostgreSQL with Drizzle ORM
- **Runtime**: Bun (not Node.js)
- **Architecture**: Domain logic in `packages/*`, UI wiring in `apps/web`
- **Points System**: Must integrate with existing `PointsService` and `TotalPointsService`
- **Auth**: Privy-based authentication (no native login tracking)

### Performance
- Daily login check must be fast (<100ms for authenticated users)
- Streak calculation should be O(1) lookup (not computed from history)
- Avoid N+1 queries when displaying streak info
- Grace period calculation must handle timezone edge cases

### Security
- Prevent duplicate claims within 24-hour window (timestamp-based idempotency)
- Validate user authentication before awarding points
- Prevent streak manipulation via API abuse (rate limiting)
- Timezone-agnostic calculations (use UTC timestamps, not calendar days)
- 36-hour grace period is forgiving but still requires engagement

### Code Quality
- **No `any` types** - strict TypeScript
- **Minimal try/catch** - fail fast, catch only expected errors
- **Reuse existing patterns** - follow `PointsService` patterns
- **Framework-agnostic domain** - keep logic in `packages/api` not `apps/web`
- **Zero lint warnings** - must pass `bun run lint`

### "Must Not Do"
- Don't create synthetic/fake data
- Don't add fake "happy path" placeholders
- Don't break existing rewards page functionality
- Don't modify `reputationPoints` calculation (use `bonusPoints` instead)
- Don't add Redis dependency (use PostgreSQL only)
- Don't create separate streak tracking service (integrate into existing services)

---

## 3. Edge Cases & Failure Modes

### Timezone & Date Edge Cases
1. **User logs in at 11:59 PM local time, then 12:01 AM** → Should count as same day (use UTC)
2. **User travels across timezones** → Streak should persist (UTC-based)
3. **Grace period boundary** → 36 hours from last claim, not calendar day
4. **Leap year / DST transitions** → Handle gracefully with UTC timestamps

### Streak Logic Edge Cases
1. **First-time user** → No streak, award Day 1 reward
2. **User misses 36+ hours since last claim** → Streak resets (grace period expired)
3. **User tries to claim before 24h since last claim** → Cannot claim yet (too early)
4. **User claims between 24-36 hours** → Streak continues, claim window extends
5. **User logs in after streak reset** → Start new streak at Day 1
6. **Concurrent claim attempts** → Prevent race conditions with database locks/transactions

### Points Award Edge Cases
1. **Duplicate claim attempts** → Idempotent (return success, no duplicate points)
2. **Points service failure** → Rollback streak update (transaction)
3. **Milestone reached mid-streak** → Award milestone bonus + daily reward
4. **User deleted/banned** → Don't award points, handle gracefully

### UI Edge Cases
1. **User not authenticated** → Redirect to login (existing pattern)
2. **Network failure during claim** → Show error, allow retry
3. **Stale streak data** → Refresh on page load
4. **Mobile vs desktop** → Responsive design (existing pattern)

### Database Edge Cases
1. **Migration rollback** → Provide rollback migration
2. **Missing fields for existing users** → Default to 0/null
3. **Database connection failure** → Return error, don't crash
4. **Concurrent updates** → Use database transactions/locks

---

## 4. Research: Relevant Patterns/APIs/Libraries

### Existing Codebase Patterns

#### Points Service Pattern (`packages/api/src/services/points-service.ts`)
- **Why**: Centralized point awarding with duplicate prevention
- **Pattern**: `PointsService.awardPoints(userId, amount, reason, metadata)`
- **Use**: Award daily login rewards via `reason: 'daily_login'` (new reason type)
- **Integration**: Updates `bonusPoints` (not `reputationPoints`), tracks via `pointsAwardedFor*` flags

#### Total Points Service (`packages/engine/src/services/total-points-service.ts`)
- **Why**: Handles `totalPoints` calculation (wallet + positions)
- **Pattern**: `TotalPointsService.recomputeTotalPoints(userId)`
- **Use**: Daily login rewards contribute to `totalPoints` via `virtualBalance` increase
- **Note**: Daily rewards should increase `virtualBalance` (wallet), which flows into `totalPoints`

#### Cron Job Pattern (`apps/web/src/app/api/cron/points-recompute/route.ts`)
- **Why**: Scheduled tasks with auth verification
- **Pattern**: `verifyCronAuth(request)`, `recordCronExecution()`
- **Use**: Optional cleanup cron for streak resets (if needed)

#### Database Schema Pattern (`packages/db/src/schema/users.ts`)
- **Why**: User table already has many `pointsAwardedFor*` boolean flags
- **Pattern**: Add `dailyLoginStreak`, `lastDailyLogin`, `longestStreak`, `totalDailyLogins`
- **Use**: Follow existing field naming conventions

#### API Route Pattern (`apps/web/src/app/api/users/[userId]/referrals/route.ts`)
- **Why**: User-specific data endpoints
- **Pattern**: `GET /api/users/[userId]/daily-login` (new endpoint)
- **Use**: Fetch streak info, claim daily reward

#### Rewards Page Pattern (`apps/web/src/app/rewards/page.tsx`)
- **Why**: Existing rewards page structure
- **Pattern**: Stats row, task cards, referral section
- **Use**: Add daily rewards hero section at top, reorganize existing sections

### Libraries & APIs

#### Date/Time Handling
- **Native JavaScript `Date`** → Use UTC methods (`getUTCDate()`, `getUTCHours()`)
- **Why**: Avoid timezone issues, consistent across servers
- **No external library needed** → Keep dependencies minimal

#### Database Transactions
- **Drizzle ORM transactions** → `db.transaction()` for atomic operations
- **Why**: Ensure streak update + points award happen atomically
- **Pattern**: Wrap streak update + points award in single transaction

---

## 5. Architecture & Data Flow

### Database Schema Changes

**Location**: `packages/db/src/schema/users.ts`

```typescript
// Add to users table:
dailyLoginStreak: integer('dailyLoginStreak').notNull().default(0),
lastDailyLogin: timestamp('lastDailyLogin', { mode: 'date' }), // Timestamp of last claim
longestStreak: integer('longestStreak').notNull().default(0),
totalDailyLogins: integer('totalDailyLogins').notNull().default(0),
```

**Note**: No boolean flag needed - `lastDailyLogin` timestamp handles claim eligibility:
- If `lastDailyLogin` is null → first-time user, can claim
- If now - `lastDailyLogin` < 24h → cannot claim yet
- If now - `lastDailyLogin` >= 24h and < 36h → can claim, streak continues
- If now - `lastDailyLogin` >= 36h → can claim, streak resets to Day 1

**Migration**: `packages/db/drizzle/migrations/0033_add_daily_login_streak.sql`

### Service Layer

**Location**: `packages/api/src/services/daily-login-service.ts` (new)

```typescript
export class DailyLoginService {
  /**
   * Record daily login and award points if eligible
   * Returns streak info and reward details
   */
  static async recordDailyLogin(userId: string): Promise<{
    streak: number;
    reward: number;
    milestoneBonus?: number;
    nextReward: number;
    daysUntilMilestone: number;
    canClaim: boolean;
    claimed: boolean;
  }>

  /**
   * Get current streak info without claiming
   */
  static async getStreakInfo(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    nextReward: number;
    daysUntilMilestone: number;
    lastLogin: Date | null;
    canClaimToday: boolean;
  }>

  /**
   * Check if user can claim today (idempotent check)
   */
  static async canClaimToday(userId: string): Promise<boolean>

  /**
   * Calculate daily reward amount based on streak day
   */
  private static calculateDailyReward(streakDay: number): number

  /**
   * Calculate milestone bonus if reached
   */
  private static calculateMilestoneBonus(streak: number): number | null

  /**
   * Check if streak should reset (36-hour grace period expired)
   */
  private static shouldResetStreak(lastClaim: Date | null): boolean

  /**
   * Check if enough time has passed since last claim (24h minimum)
   */
  private static canClaimNext(lastClaim: Date | null): boolean
}
```

**Integration Points**:
- Uses `PointsService.awardPoints()` for point awarding
- Updates `virtualBalance` via balance transaction (flows to `totalPoints`)
- Uses database transactions for atomicity

### API Routes

**Location**: `apps/web/src/app/api/users/daily-login/route.ts` (new)

```typescript
// GET /api/users/daily-login
// Returns streak info (doesn't claim)
export async function GET(request: NextRequest)

// POST /api/users/daily-login
// Claims daily reward (idempotent)
export async function POST(request: NextRequest)
```

**Authentication**: Uses `authenticate(request)` middleware (existing pattern)

### UI Components

**Location**: `apps/web/src/components/daily-login/` (new directory)

```
daily-login/
  ├── DailyStreakCard.tsx      # Hero card (main feature)
  ├── DailyLoginModal.tsx      # Claim modal with celebration
  ├── StreakBadge.tsx          # Reusable badge component
  └── index.ts                 # Exports
```

**Integration**: 
- Add `DailyStreakCard` to top of rewards page
- Trigger modal on claim
- Show badge in profile (optional, future)

### Rewards Page Redesign

**Location**: `apps/web/src/app/rewards/page.tsx`

**New Structure**:
1. **Top Section**: Points Overview (Earned Points, Total Points) - existing
2. **Hero Section**: Daily Rewards & Streak (NEW - main feature)
3. **Middle Section**: Referrals - move from bottom
4. **Future Section**: Gamified Badges (placeholder)
5. **Bottom Section**: Social Connections (one-time tasks) - move from top

### Data Flow

```
User logs in → useAuth() hook detects auth
  ↓
User visits /rewards → RewardsPage loads
  ↓
Fetch streak info → GET /api/users/daily-login
  ↓
Display DailyStreakCard → Shows streak, next reward, progress bar, claim button
  ↓
User clicks "Claim" → POST /api/users/daily-login
  ↓
DailyLoginService.recordDailyLogin()
  ├─ Check time since last claim:
  │   ├─ < 24 hours → Cannot claim yet (return canClaim: false)
  │   ├─ 24-36 hours → Can claim, streak continues
  │   └─ > 36 hours → Can claim, streak resets to Day 1
  ├─ Calculate daily reward + milestone bonus
  ├─ Update database (transaction):
  │   ├─ Update streak fields (lastDailyLogin timestamp)
  │   ├─ Award points via PointsService (bonusPoints)
  │   └─ Update virtualBalance (flows to totalPoints)
  └─ Return reward details
  ↓
UI shows celebration modal with confetti → User sees points awarded
  ↓
Refresh streak display → Updated streak count
```

### Claim Window Logic

```
Last Claim                    24h                     36h
    |-------------------------|------------------------|
    |     Cannot claim yet    |   Can claim (streak   |   Streak resets
    |                         |   continues)          |   (start Day 1)
    |<------- WAIT ---------->|<----- CLAIM WINDOW -->|<--- RESET --->
```

- **0-24 hours since last claim**: Cannot claim yet (must wait)
- **24-36 hours since last claim**: Claim window open, streak continues
- **36+ hours since last claim**: Streak resets, start at Day 1 (can still claim)

### Points Integration

**Daily rewards contribute to `totalPoints`**:
- Award points via `PointsService.awardPoints(userId, amount, 'daily_login')`
- Points go to `bonusPoints` (for tracking/leaderboard purposes)
- Also increase `virtualBalance` (wallet) so it flows to `totalPoints`
- This aligns with BAB-173 (Total Points = wallet + positions)

**Reward Structure**:
- Day 1: 50 points
- Day 2: 75 points
- Day 3: 100 points
- Day 4: 125 points
- Day 5: 150 points
- Day 6: 175 points
- Day 7: 200 points + 500 milestone bonus = 700 points
- Week 2+: Pattern repeats (Day 1-7 rewards cycle)

**Milestone Bonuses** (cumulative, awarded when streak reaches milestone):
- 7 days: 500 bonus points
- 14 days: 750 bonus points
- 30 days: 1,500 bonus points
- 60 days: 3,000 bonus points
- 90 days: 5,000 bonus points

**Claim Window**:
- Must wait 24 hours between claims
- Have up to 36 hours to claim before streak resets
- Example: Claim at 10am Monday → can claim again after 10am Tuesday → must claim before 10pm Tuesday or streak resets

---

## 6. Definition of "Done"

### Acceptance Criteria

#### Database & Backend
- [ ] Migration adds `dailyLoginStreak`, `lastDailyLogin`, `longestStreak`, `totalDailyLogins` to users table
- [ ] Migration includes rollback script
- [ ] `DailyLoginService` implements all methods with proper error handling
- [ ] Daily login tracking uses UTC for timestamp calculations
- [ ] 24-hour minimum wait between claims enforced
- [ ] 36-hour grace period (claim window) implemented correctly
- [ ] Streak resets if 36+ hours pass since last claim
- [ ] Streak reset logic handles edge cases (timezone, boundaries)
- [ ] Points awarded via `PointsService` with `reason: 'daily_login'`
- [ ] Points increase `virtualBalance` (flows to `totalPoints`)
- [ ] Duplicate claim prevention within 24-hour window (idempotent)
- [ ] Database transactions ensure atomicity

#### API Routes
- [ ] `GET /api/users/daily-login` returns streak info
- [ ] `POST /api/users/daily-login` claims reward (idempotent)
- [ ] Both routes require authentication
- [ ] Error handling returns appropriate status codes
- [ ] Follows existing API route patterns

#### UI Components
- [ ] `DailyStreakCard` displays streak, next reward, milestone progress bar
- [ ] `DailyStreakCard` follows existing card patterns (no icons, no emojis)
- [ ] `DailyLoginModal` shows simple celebration with confetti on claim
- [ ] `StreakBadge` component created (reusable, minimal design)
- [ ] Components match existing design system
- [ ] Responsive (mobile + desktop)
- [ ] Loading states handled
- [ ] Error states handled
- [ ] Claim button disabled when cannot claim yet (< 24h since last claim)

#### Rewards Page Redesign
- [ ] Daily rewards section added as hero (top of main content)
- [ ] Referrals section moved to middle
- [ ] Social connections section moved to bottom
- [ ] Points display shows "Earned Points" and "Total Points" at top
- [ ] Visual hierarchy emphasizes daily rewards
- [ ] Existing functionality preserved (no regressions)

#### Points Constants
- [ ] Daily reward constants added (Day 1: 50, Day 2: 75, ... Day 7: 200)
- [ ] Milestone bonus constants added (7d: 500, 14d: 750, 30d: 1500, 60d: 3000, 90d: 5000)
- [ ] `PointsReason` type includes `'daily_login'`
- [ ] Constants exported from `packages/shared/src/constants/points.ts`
- [ ] Grace period (36h) and minimum wait (24h) as constants

### Measurable Checks

#### Code Quality
- [ ] `bun run typecheck` passes (zero errors)
- [ ] `bun run lint` passes (zero warnings)
- [ ] `bun run build` succeeds
- [ ] All TypeScript types are explicit (no `any`)
- [ ] Error handling follows existing patterns

#### Testing
- [ ] Unit tests for `DailyLoginService` methods
- [ ] Integration tests for API routes
- [ ] Edge case tests (timezone, grace period, duplicate claims)
- [ ] Tests use existing testing patterns (`packages/testing`)

#### Documentation
- [ ] Code comments follow existing style
- [ ] JSDoc comments for public methods
- [ ] Migration includes comments explaining fields

---

## 7. Unknowns & Risks

### Resolved Decisions

1. **When exactly should we trigger daily login check?**
   - **Decision**: Manual "Claim" button on rewards page (confirmed by product)
   - User must visit rewards page and click to claim

2. **How to handle users who haven't claimed for a while?**
   - **Decision**: 36-hour grace period from last claim (confirmed by product)
   - 0-24h: Cannot claim yet (must wait)
   - 24-36h: Claim window open, streak continues
   - 36h+: Streak resets to Day 1, can still claim

3. **Should daily rewards increase `virtualBalance` or `bonusPoints`?**
   - **Decision**: Both (confirmed by product)
   - Increase `virtualBalance` (wallet) → flows to `totalPoints`
   - Track via `PointsService` with `reason: 'daily_login'` → goes to `bonusPoints`

4. **What happens if user doesn't claim within the window?**
   - **Decision**: Streak resets after 36 hours since last claim
   - User starts fresh at Day 1 but can immediately claim

5. **Should we track "last claim date" or "last login date"?**
   - **Decision**: Track `lastDailyLogin` as last claim timestamp
   - No separate boolean flag needed - timestamp-based logic handles everything

### Risks

1. **Risk**: Timezone confusion causing incorrect streak calculations
   - **Mitigation**: Use UTC timestamps for all calculations, no calendar-day logic
   - **Testing**: Test with different timezones, edge cases (crossing UTC midnight)

2. **Risk**: Race conditions with concurrent claim attempts
   - **Mitigation**: Use database transactions with row-level locking
   - **Testing**: Load test concurrent claims from same user

3. **Risk**: Points awarded but streak not updated (partial failure)
   - **Mitigation**: Use database transactions, rollback on error
   - **Testing**: Simulate database errors during transaction

4. **Risk**: Breaking existing rewards page functionality
   - **Mitigation**: Preserve existing sections, add new section without removing old ones initially
   - **Testing**: Manual QA of rewards page, check all existing features work

5. **Risk**: Performance impact of daily login check on every page load
   - **Mitigation**: Cache streak info in React state, only fetch on rewards page or explicit refresh
   - **Testing**: Profile API response times

6. **Risk**: Migration fails on production database
   - **Mitigation**: Test migration on staging, provide rollback script, use `IF NOT EXISTS` clauses
   - **Testing**: Run migration on copy of production data

---

## 8. Clarifying Questions (All Resolved)

### Product/Design Decisions (Confirmed)

1. **Claim Timing**: Manual claim on rewards page - user must click to claim
2. **Visual Design**: Follow existing card patterns, no icons, no emojis
3. **Milestone Display**: Progress bar showing days until next milestone
4. **Celebration Animation**: Simple modal with confetti celebration
5. **Grace Period**: 36 hours (not 24) - more forgiving for users

### Technical Decisions (Confirmed)

1. **Points Flow**: Yes, both - increase `virtualBalance` (wallet) → flows to `totalPoints`, AND track via `bonusPoints`
2. **Cron Job**: No cron needed - use timestamp-based logic on each claim attempt
3. **Streak Reset**: Check on claim attempt - if 36+ hours since last claim, reset streak then allow claim

---

## Implementation Order

1. **Database Migration** → Add fields to users table
2. **Points Constants** → Add daily login constants and reason type
3. **DailyLoginService** → Core service logic
4. **API Routes** → GET/POST endpoints
5. **UI Components** → DailyStreakCard, Modal, Badge
6. **Rewards Page Integration** → Add hero section, reorganize layout
7. **Testing** → Unit tests, integration tests, edge cases
8. **Documentation** → Code comments, migration notes

---

## Next Steps

1. **Plan approved** → All questions resolved, ready to implement
2. **Start implementation** → Follow implementation order below
3. **Quality checks** → typecheck, lint, build, tests after each step
4. **Iterate** → Get feedback, adjust as needed

---

## Summary of Key Decisions

| Decision | Value |
|----------|-------|
| Grace Period | 36 hours (not 24) |
| Minimum Wait Between Claims | 24 hours |
| Claim Trigger | Manual button on rewards page |
| UI Style | Follow existing card patterns, no icons/emojis |
| Milestone Display | Progress bar |
| Celebration | Simple modal with confetti |
| Points Flow | Both `virtualBalance` AND `bonusPoints` |
| Cron Job | Not needed (timestamp-based logic) |
| Streak Reset | Checked on claim attempt |
