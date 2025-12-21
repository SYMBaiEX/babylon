# 📊 Markets Frontend Integration - Audit & Action Plan

> **Date**: December 2024  
> **Scope**: Perpetual Markets & Prediction Markets Frontend Integration  
> **Status**: Analysis Complete - Ready for Implementation

---

## Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Critical Findings](#-critical-findings-priority-high)
3. [Important Findings](#-important-findings-priority-medium)
4. [Minor Findings](#-minor-findings-priority-low)
5. [Incomplete Features](#-incomplete-features)
6. [Summary Table](#-summary-table)
7. [PR Organization Plan](#-pr-organization-plan)
8. [Execution Timeline](#-execution-timeline)
9. [PR Checklists](#-pr-checklists)

---

## 🏗️ Architecture Overview

The markets implementation is structured around:

### Stores (Zustand)
- `perpMarketsStore.ts` - Centralized perp markets state management
- `predictionMarketsStore.ts` - Centralized prediction markets state management

### Main Hooks
- `useMarketPrices.ts` - Real-time prices via SSE
- `useUserPositions.ts` - User positions
- `usePerpTrade.ts` - Perp trading
- `usePerpHistory.ts` / `usePredictionHistory.ts` - Price histories
- `usePredictionMarketStream.ts` - SSE for predictions
- `usePortfolioPnL.ts` - Portfolio P&L
- `useSSE.ts` - Global SSE management

### Pages
- `/markets/page.tsx` - Main dashboard (~1700 lines)
- `/markets/perps/page.tsx` - Perps list
- `/markets/perps/[ticker]/page.tsx` - Perp detail
- `/markets/predictions/page.tsx` - Predictions list
- `/markets/predictions/[id]/page.tsx` - Prediction detail

---

## 🔴 Critical Findings (Priority High)

### Finding #1: Missing Error Handling in Data Hooks

**Files**: `usePerpHistory.ts`, `usePredictionHistory.ts`, `useUserPositions.ts`

**Problem**: Hooks use empty or incomplete try/catch blocks that silence network errors without user feedback.

```typescript
// usePredictionHistory.ts lines 236-240
} catch (err) {
  setError(err instanceof Error ? err.message : 'Failed to fetch history');
  setHistory(fallbackFromSeed());
}
```

**But in `useUserPositions.ts`**:
```typescript
// useUserPositions.ts lines 180-185
// No try/catch around fetch calls!
const response = await fetch(
  `/api/markets/positions/${encodeURIComponent(userId)}`,
  { signal: controller.signal }
);
```

**Suggestion**: Wrap all network calls in proper try/catch blocks and propagate errors to UI. Create a generic `useSafeAsync` hook to standardize error handling.

---

### Finding #2: Excessive Re-renders in Main Markets Page

**File**: `apps/web/src/app/markets/page.tsx` (1700+ lines)

**Problems**:
- Page is a monolith of ~1700 lines with lots of local state
- Massive code duplication between desktop and mobile versions (lines 446-1055 vs 1057-1637)
- Multiple `useMemo` depending on entire arrays causing recalculations

```typescript
// page.tsx lines 247-266
const filteredPerpMarkets = useMemo(
  () =>
    perpMarkets.filter(
      (m) =>
        !searchQuery.trim() ||
        m.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  [perpMarkets, searchQuery]  // perpMarkets is an entire array
);
```

**Suggestion**: 
- Extract into distinct components: `MarketsDesktopView`, `MarketsMobileView`, `TrendingMarkets`, `HotPredictions`
- Use `React.memo()` for list components
- Implement virtualization for long lists

---

### Finding #3: Unstable useEffect Dependencies in Stores

**Files**: `perpMarketsStore.ts`, `predictionMarketsStore.ts`

**Problem**: Polling uses `useRef` to avoid re-subscriptions but logic can lead to interval leaks in edge cases.

```typescript
// perpMarketsStore.ts lines 201-211
export function usePerpMarketsPolling(intervalMs = 30000) {
  const subscribe = usePerpMarketsStore((state) => state.subscribe);
  const intervalRef = useRef(intervalMs);

  useEffect(() => {
    const unsubscribe = subscribe(intervalRef.current);
    return unsubscribe;
  }, [subscribe]); // intervalRef.current will never change!
}
```

**Suggestion**: If `intervalMs` changes, polling will never update. Add `intervalMs` to dependencies or document that this is intentional.

---

### Finding #4: No Error Handling in Trading Modals

**Files**: `PerpTradingModal.tsx`, `PredictionTradingModal.tsx`

**Problem**: `handleSubmit` functions don't handle errors correctly - especially in `PredictionTradingModal`:

```typescript
// PredictionTradingModal.tsx lines 163-178
const response = await fetch(
  `/api/markets/predictions/${question.id}/buy`,
  {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ side, amount: amountNum }),
  }
);

await response.json();  // No response.ok check!

toast.success(`Bought ${side.toUpperCase()} shares!`, { ... });
```

**Suggestion**: Add `response.ok` check and display error before showing success toast.

---

## 🟠 Important Findings (Priority Medium)

### Finding #5: Inconsistent Auth Token Usage

**Problem**: Different approaches to get the token:
- `window.__privyAccessToken` (global, untyped)
- `getAccessToken()` via hook
- Some places don't use token at all

```typescript
// PredictionTradingModal.tsx lines 155-158
const token =
  typeof window !== 'undefined' ? window.__privyAccessToken : null;
```

vs.

```typescript
// predictions/[id]/page.tsx lines 313-318
const token = await getAccessToken();
if (!token) {
  toast.error('Authentication required. Please log in.');
  setSubmitting(false);
  return;
}
```

**Suggestion**: Create a unified `useAuthToken()` hook that handles token retrieval consistently everywhere.

---

### Finding #6: Complex SSE Hook with Mutable Global Variables

**File**: `useSSE.ts` (760+ lines)

**Problem**: Hook uses mutable global variables outside React:

```typescript
// useSSE.ts lines 84-98
const channelSubscribers = new Map<Channel, Set<SSECallback>>();
const requestedChannels = new Set<Channel>();
let connectedChannels = new Set<Channel>();
let globalEventSource: EventSource | null = null;
let connecting = false;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
...
```

**Risks**: Race conditions between tabs, unpredictable shared state, hard to test.

**Suggestion**: Encapsulate in a singleton class or use Context with a ref for SSE connection.

---

### Finding #7: Duplicate Types Between Files

**Problem**: Interfaces `PredictionMarket`, `PerpPosition`, etc. are redefined in multiple files:
- `page.tsx` (markets)
- `page.tsx` (predictions)
- `PredictionPositionsList.tsx`
- `PredictionTradingModal.tsx`

**Suggestion**: Centralize all types in `@babylon/shared` or a local `types/markets.ts` file.

---

### Finding #8: No Debounce on Search

**Files**: `page.tsx` (markets), `page.tsx` (perps), `page.tsx` (predictions)

```typescript
// page.tsx lines 476-479
<input
  type="search"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}  // No debounce
```

**Suggestion**: Use `useDeferredValue` or debounce to avoid recalculations on every keystroke.

---

### Finding #9: Non-memoized Expensive Calculations in PerpPositionsList

**File**: `PerpPositionsList.tsx`

```typescript
// PerpPositionsList.tsx lines 156-164
{positions.map((position) => {
  const livePrice = livePrices.get(position.ticker)?.price;
  const currentPrice = livePrice ?? position.currentPrice;
  const { pnl: dynamicPnL, pnlPercent: dynamicPnLPercent } =
    calculateUnrealizedPnL(  // Calculated on every render!
      position.entryPrice,
      currentPrice,
      position.side,
      position.size
    );
```

**Suggestion**: Use `useMemo` for position calculations or pre-calculate in a dedicated hook.

---

## 🟡 Minor Findings (Priority Low)

### Finding #10: console.error Instead of Proper Logging

```typescript
// page.tsx lines 182-186
if (!predictionsRes.ok) {
  console.error(
    'Failed to fetch predictions: Failed to fetch predictions'
  );
```

**Suggestion**: Use the shared logger from `@babylon/shared` instead of `console.error`.

---

### Finding #11: Magic Numbers in Code

```typescript
// predictions/page.tsx lines 310-311
while (nextPoints.length > 20) {
  nextPoints.shift();
```

**Suggestion**: Extract to named constants (`MAX_SPARKLINE_POINTS`).

---

### Finding #12: Body Scroll Lock Not Perfectly Handled

Modals have correct cleanup but logic can leave overflow disabled if multiple modals are opened/closed quickly:

```typescript
// PerpTradingModal.tsx lines 91-96
useEffect(() => {
  return () => {
    document.body.style.overflow = '';  // Can override another modal
  };
}, []);
```

**Suggestion**: Use an open modal counter or a library like `react-remove-scroll`.

---

### Finding #13: Missing Loading Indicators on Actions

"Close Position" and "Sell Shares" buttons show a spinner but not the input fields during loading.

**Suggestion**: Disable inputs during `loading` and add skeletons if data isn't ready.

---

### Finding #14: PredictionTradingModal Doesn't Check User Balance

Unlike `PerpTradingModal` which checks balance:

```typescript
// PerpTradingModal.tsx lines 143-145
const showBalanceWarning =
  authenticated && sizeNum > 0 && balance < totalRequired;
```

`PredictionTradingModal` doesn't do this check.

**Suggestion**: Add the same balance warning logic.

---

### Finding #15: SSE Hooks Don't Handle Offline/Online Case

**Suggestion**: Add `navigator.onLine` listeners and `window.addEventListener('online'/'offline')` to auto-reconnect.

---

## 💡 Incomplete Features

1. **On-chain betting** (`useOnChainBetting.ts`) - Present but not used in current trading components
2. **Trades feed** (`AssetTradesFeed.tsx`) - Need to verify SSE integration
3. **Prediction sparklines** - Implemented but seed fallback can be improved
4. **Polling intervals** - Not synchronized between stores (30s by default)

---

## 📊 Summary Table

| # | Finding | Priority | Effort | Impact |
|---|---------|----------|--------|--------|
| 1 | Error handling in hooks | 🔴 Critical | Medium | High |
| 2 | Refactoring Markets page | 🔴 Critical | High | High |
| 3 | useEffect deps in stores | 🔴 Critical | Low | Medium |
| 4 | Errors in Trading Modals | 🔴 Critical | Low | High |
| 5 | Unified auth token | 🟠 Important | Medium | Medium |
| 6 | SSE global state | 🟠 Important | High | Medium |
| 7 | Centralized types | 🟠 Important | Medium | Medium |
| 8 | Debounce search | 🟠 Important | Low | Medium |
| 9 | Memoize positions calc | 🟠 Important | Low | Medium |
| 10 | Proper logger | 🟡 Minor | Low | Low |
| 11 | Magic numbers | 🟡 Minor | Low | Low |
| 12 | Body scroll lock | 🟡 Minor | Low | Low |
| 13 | Loading indicators | 🟡 Minor | Low | Medium |
| 14 | Balance check predictions | 🟡 Minor | Low | Medium |
| 15 | Online/Offline SSE | 🟡 Minor | Medium | Medium |

---

## 📦 PR Organization Plan

### Branch Overview

```
main
├── fix/markets-error-handling          # PR #1 - Errors & Logging
├── fix/markets-auth-token              # PR #2 - Unified token
├── perf/markets-memoization            # PR #3 - Quick perf wins
├── refactor/markets-types              # PR #4 - Centralized types
├── fix/markets-trading-ux              # PR #5 - UX Trading modals
├── refactor/markets-page-split         # PR #6 - Markets page split (BIG)
├── refactor/sse-architecture           # PR #7 - SSE refactor (BIG)
└── feat/markets-offline-support        # PR #8 - Online/Offline
```

---

### PR #1: Error Handling & Logging
**Branch**: `fix/markets-error-handling`  
**Priority**: 🔴 Critical  
**Effort**: ~2-3h  
**Risk**: Low  

#### Scope
| Finding | Files |
|---------|-------|
| #1 - Error handling in hooks | `useUserPositions.ts`, `usePerpHistory.ts`, `usePredictionHistory.ts` |
| #4 - Errors in Trading Modals | `PerpTradingModal.tsx`, `PredictionTradingModal.tsx` |
| #10 - Proper logger | `page.tsx` (markets), `page.tsx` (predictions) |

#### Suggested Commits
```
1. fix(hooks): add proper error handling to useUserPositions
2. fix(hooks): add proper error handling to usePerpHistory and usePredictionHistory  
3. fix(modals): add response.ok check in PredictionTradingModal
4. fix(modals): ensure consistent error handling in PerpTradingModal
5. refactor(markets): replace console.error with shared logger
```

#### Review Criteria
- [ ] All errors propagated to UI
- [ ] No empty or silent catches
- [ ] User-friendly error messages
- [ ] Manual testing of error cases

---

### PR #2: Auth Token Unification
**Branch**: `fix/markets-auth-token`  
**Priority**: 🟠 Important  
**Effort**: ~1-2h  
**Risk**: Low  

#### Scope
| Finding | Files |
|---------|-------|
| #5 - Unified token | `PredictionTradingModal.tsx`, `PredictionPositionsList.tsx`, pages |

#### Suggested Commits
```
1. refactor(auth): create useAuthToken hook for consistent token access
2. refactor(modals): use useAuthToken in PredictionTradingModal
3. refactor(positions): use useAuthToken in PredictionPositionsList
```

#### Review Criteria
- [ ] No more direct `window.__privyAccessToken`
- [ ] Reusable hook with appropriate fallback
- [ ] Type-safe

---

### PR #3: Quick Performance Wins
**Branch**: `perf/markets-memoization`  
**Priority**: 🟠 Important  
**Effort**: ~1-2h  
**Risk**: Low  

#### Scope
| Finding | Files |
|---------|-------|
| #8 - Debounce search | `page.tsx` (markets, perps, predictions) |
| #9 - Memoize positions calc | `PerpPositionsList.tsx` |
| #3 - useEffect deps in stores | `perpMarketsStore.ts`, `predictionMarketsStore.ts` |

#### Suggested Commits
```
1. perf(search): add useDeferredValue to search inputs
2. perf(positions): memoize PnL calculations in PerpPositionsList
3. fix(stores): document/fix polling interval behavior in stores
```

#### Review Criteria
- [ ] React DevTools Profiler before/after
- [ ] No functional regression
- [ ] Polling behavior documented

---

### PR #4: Types Centralization
**Branch**: `refactor/markets-types`  
**Priority**: 🟠 Important  
**Effort**: ~2-3h  
**Risk**: Low  

#### Scope
| Finding | Files |
|---------|-------|
| #7 - Centralized types | Multiple files |
| #11 - Magic numbers | Multiple files |

#### Suggested Commits
```
1. refactor(types): create shared market types in apps/web/src/types/markets.ts
2. refactor(types): migrate PredictionMarket interface to shared types
3. refactor(types): migrate PerpPosition interface to shared types
4. refactor(constants): extract magic numbers to named constants
5. refactor: update all imports to use centralized types
```

#### Review Criteria
- [ ] No type duplication
- [ ] All magic numbers extracted
- [ ] TypeCheck passes

---

### PR #5: Trading UX Improvements
**Branch**: `fix/markets-trading-ux`  
**Priority**: 🟡 Minor  
**Effort**: ~2h  
**Risk**: Low  

#### Scope
| Finding | Files |
|---------|-------|
| #12 - Body scroll lock | Modals |
| #13 - Loading indicators | Modals, pages |
| #14 - Balance check predictions | `PredictionTradingModal.tsx`, detail page |

#### Suggested Commits
```
1. fix(modals): implement proper body scroll lock with counter
2. feat(predictions): add balance check before buying shares
3. feat(trading): improve loading states and disable inputs during submit
```

#### Review Criteria
- [ ] Test multi-modal open/close
- [ ] Balance warning visible in prediction trading
- [ ] Inputs disabled during loading

---

### PR #6: Markets Page Split (BIG REFACTOR)
**Branch**: `refactor/markets-page-split`  
**Priority**: 🔴 Critical  
**Effort**: ~6-8h  
**Risk**: Medium  
**⚠️ Do after PRs #1-5**

#### Scope
| Finding | Files |
|---------|-------|
| #2 - Refactoring Markets page | `page.tsx` (1700 lines → multiple components) |

#### Proposed Structure
```
apps/web/src/app/markets/
├── page.tsx                           # Orchestration (~100 lines)
├── _components/
│   ├── MarketsDesktopLayout.tsx       # Desktop layout
│   ├── MarketsMobileLayout.tsx        # Mobile layout
│   ├── DashboardTab.tsx               # Dashboard tab content
│   ├── PerpsTab.tsx                   # Perps tab content
│   ├── PredictionsTab.tsx             # Predictions tab content
│   ├── TrendingPerpsList.tsx          # Trending widget
│   ├── HotPredictionsList.tsx         # Hot predictions widget
│   ├── PositionsOverview.tsx          # User positions section
│   └── MarketsCTA.tsx                 # Non-authenticated CTA
└── _hooks/
    └── useMarketsPageData.ts          # Centralized data fetching
```

#### Suggested Commits
```
1. refactor(markets): extract useMarketsPageData hook
2. refactor(markets): extract TrendingPerpsList component
3. refactor(markets): extract HotPredictionsList component
4. refactor(markets): extract PositionsOverview component
5. refactor(markets): extract tab content components
6. refactor(markets): extract layout components (desktop/mobile)
7. refactor(markets): simplify main page.tsx to orchestration only
8. test(markets): add component tests for extracted components
```

#### Review Criteria
- [ ] Each component < 300 lines
- [ ] Props well typed
- [ ] No duplication
- [ ] Unit tests for extracted logic
- [ ] Visual regression check

---

### PR #7: SSE Architecture Refactor (BIG REFACTOR)
**Branch**: `refactor/sse-architecture`  
**Priority**: 🟠 Important  
**Effort**: ~4-6h  
**Risk**: Medium-High  
**⚠️ Can be done in parallel with PR #6**

#### Scope
| Finding | Files |
|---------|-------|
| #6 - SSE global state | `useSSE.ts` (760 lines) |

#### Suggested Approach
```typescript
// Encapsulate in a singleton class instead of global variables
class SSEManager {
  private static instance: SSEManager;
  private eventSource: EventSource | null = null;
  private subscribers: Map<Channel, Set<Callback>>;
  // ...
}
```

#### Suggested Commits
```
1. refactor(sse): create SSEManager singleton class
2. refactor(sse): migrate global variables to class properties
3. refactor(sse): update useSSE to use SSEManager
4. refactor(sse): update useSSEChannel to use new architecture
5. test(sse): add unit tests for SSEManager
6. docs(sse): document new SSE architecture
```

#### Review Criteria
- [ ] No mutable global variables
- [ ] Reconnection tests
- [ ] Identical behavior to existing
- [ ] No memory leaks

---

### PR #8: Offline Support (Future)
**Branch**: `feat/markets-offline-support`  
**Priority**: 🟡 Minor  
**Effort**: ~2-3h  
**Risk**: Low  
**⚠️ Depends on PR #7**

#### Scope
| Finding | Files |
|---------|-------|
| #15 - Online/Offline SSE | `useSSE.ts`, `SSEManager` |

#### Suggested Commits
```
1. feat(sse): add online/offline event listeners
2. feat(sse): auto-reconnect when coming back online
3. feat(ui): add connection status indicator component
```

---

## 📊 Execution Timeline

```
Week 1:
├── PR #1 (Error Handling) ────────────► Merge
├── PR #2 (Auth Token) ────────────────► Merge
└── PR #3 (Perf Wins) ─────────────────► Merge

Week 2:
├── PR #4 (Types) ─────────────────────► Merge
├── PR #5 (Trading UX) ────────────────► Merge
│
├── PR #6 (Page Split) ── Start ───────► Review
└── PR #7 (SSE Refactor) ── Start ─────► Review

Week 3:
├── PR #6 (Page Split) ────────────────► Merge
├── PR #7 (SSE Refactor) ──────────────► Merge
└── PR #8 (Offline) ───────────────────► Merge
```

---

## 🏷️ Naming Conventions

### Branches
```
fix/*     → Bug fixes
feat/*    → New features
refactor/* → Refactoring without functional changes
perf/*    → Performance improvements
docs/*    → Documentation
test/*    → Adding tests
```

### Commits (Conventional Commits)
```
fix(scope): description
feat(scope): description
refactor(scope): description
perf(scope): description
```

---

## ✅ PR Checklists

### Standard PR Checklist
```markdown
## PR Checklist
- [ ] TypeScript typecheck passes (`bun run typecheck`)
- [ ] Linter passes (`bun run lint`)
- [ ] Tests pass
- [ ] No dead/commented code
- [ ] Manual review done
- [ ] Tested locally
```

### Big Refactor PR Checklist (PR #6, #7)
```markdown
## Big Refactor Checklist
- [ ] TypeScript typecheck passes (`bun run typecheck`)
- [ ] Linter passes (`bun run lint`)
- [ ] Tests pass
- [ ] No dead/commented code
- [ ] Manual review done
- [ ] Tested locally
- [ ] Visual regression check
- [ ] Performance profiling done
- [ ] Documentation updated
- [ ] Breaking changes documented
```

---

## 📝 Progress Tracking

### PR Status

| PR | Branch | Status | Assigned | Notes |
|----|--------|--------|----------|-------|
| #1 | `fix/markets-error-handling` | ⏳ Not Started | - | - |
| #2 | `fix/markets-auth-token` | ⏳ Not Started | - | - |
| #3 | `perf/markets-memoization` | ⏳ Not Started | - | - |
| #4 | `refactor/markets-types` | ⏳ Not Started | - | - |
| #5 | `fix/markets-trading-ux` | ⏳ Not Started | - | - |
| #6 | `refactor/markets-page-split` | ⏳ Not Started | - | Depends on #1-5 |
| #7 | `refactor/sse-architecture` | ⏳ Not Started | - | Can parallel with #6 |
| #8 | `feat/markets-offline-support` | ⏳ Not Started | - | Depends on #7 |

---

## 🔗 Related Files Quick Reference

### Stores
- `apps/web/src/stores/perpMarketsStore.ts`
- `apps/web/src/stores/predictionMarketsStore.ts`

### Hooks
- `apps/web/src/hooks/useMarketPrices.ts`
- `apps/web/src/hooks/useUserPositions.ts`
- `apps/web/src/hooks/usePerpTrade.ts`
- `apps/web/src/hooks/usePerpHistory.ts`
- `apps/web/src/hooks/usePredictionHistory.ts`
- `apps/web/src/hooks/usePredictionMarketStream.ts`
- `apps/web/src/hooks/usePortfolioPnL.ts`
- `apps/web/src/hooks/useSSE.ts`
- `apps/web/src/hooks/useOnChainBetting.ts`

### Pages
- `apps/web/src/app/markets/page.tsx`
- `apps/web/src/app/markets/perps/page.tsx`
- `apps/web/src/app/markets/perps/[ticker]/page.tsx`
- `apps/web/src/app/markets/predictions/page.tsx`
- `apps/web/src/app/markets/predictions/[id]/page.tsx`

### Components
- `apps/web/src/components/markets/PerpTradingModal.tsx`
- `apps/web/src/components/markets/PredictionTradingModal.tsx`
- `apps/web/src/components/markets/PerpPositionsList.tsx`
- `apps/web/src/components/markets/PredictionPositionsList.tsx`
- `apps/web/src/components/markets/PerpPriceChart.tsx`
- `apps/web/src/components/markets/PredictionProbabilityChart.tsx`
- `apps/web/src/components/markets/TradeConfirmationDialog.tsx`
- `apps/web/src/components/markets/AssetTradesFeed.tsx`


