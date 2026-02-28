# DRY Opportunities Inventory

Duplicated logic and repeated patterns that could be consolidated. Verified against the codebase.

---

## 1. Currency / number formatting

**Canonical:** `packages/shared/src/utils/format.ts` — `formatCurrency` (ƀ, optional `useThousandsSeparator`) and `formatCompactCurrency` (K/M/B). No configurable symbol.

### 1.1 Web: local wrappers

Components import from `@babylon/shared` but each defines its own wrapper (NaN handling + options). Replace with shared helpers.

| File | Pattern |
|------|--------|
| `PortfolioPnLShareCard.tsx`, `CategoryPnLShareCard.tsx`, `CategoryPnLCard.tsx` | `formatCurrencyShared(safeValue, { useThousandsSeparator: true })` |
| `AssetTradesFeed.tsx` | Same + string coerce, NaN→0 |
| `UserManagementTab.tsx`, `StatsTab.tsx` | `parseFloat` → `formatCompactCurrency` |
| `EscrowManagementTab.tsx` | `parseFloat` → `formatCurrencyShared` |
| `TradeCard.tsx` | `Number(value)` → `formatCompactCurrency` |

*No change needed:* `MarketOversightTab`, `FeesTab`, `TradingProfile`, `TradingFeedTab` — they alias `formatCompactCurrency` directly.

**Recommendation:** Add `apps/web/src/lib/format.ts` with `formatCurrencyDisplay(value)` (thousands separator) and `formatCurrencyCompact(value)` (K/M/B). Both accept `string | number | null | undefined`, coerce and guard NaN, then call shared. Use in the 8 files above.

### 1.2 Non-web: USD formatters ($)

Engine, simulation, and training use `$` (not ƀ). Training has canonical utils; other packages repeat the pattern.

| Package | Location | Notes |
|---------|----------|--------|
| Engine | `npc-positions-context-service.ts` | Local `formatCurrency(n)` — $ + K/M |
| Testing | `simulation/simulation-report.ts` | `formatCurrency` + `formatCurrencySigned` |
| Training | `utils/index.ts` | `formatCurrency`, `formatCurrencyWithSign` — use these everywhere in training |

**Training files still using ad-hoc `.toFixed(2)` / `$`:**  
`HuggingFaceModelUploader.ts`, `HuggingFaceDatasetUploader.ts`, `StakeholderReport.ts`, `ArchetypeMatchupBenchmark.ts`, `VLLMBenchmarkRunner.ts`

**Recommendation:** In training, call `formatCurrency` / `formatCurrencyWithSign` from `packages/training/src/utils/index.ts` instead of inline `.toFixed(2)` and `$`. For engine/simulation, consider a shared `packages/testing/src/utils/format.ts` for compact-USD if both can share it.

---

## 2. API route patterns

### 2.1 Body parse + validation + errors

- **Parse + Zod:** 35 routes do `request.json()` → `schema.safeParse(body)` → 400 on failure. No shared helper.
- **Error shape:** Mix of inline `NextResponse.json({ error })`, `{ success: false, error }`, and `errorResponse()` from `@babylon/api`.

**Recommendation:** Add `parseJsonBody<T>(request, schema)` returning `{ data: T } | NextResponse` (in `@babylon/api` or `apps/web/src/lib/api-utils.ts`). Use `errorResponse()` from `@babylon/api` for all error responses so shape is consistent.

### 2.2 Cron auth

Every cron route repeats:

```ts
if (!verifyCronAuth(request, { jobName: 'XxxCron' }))
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

33 occurrences across 20 cron route dirs under `apps/web/src/app/api/cron/`.

**Recommendation:** Add `withCronAuth(jobName, handler)`; each route: `export const GET = withCronAuth('XxxCron', async (req) => { ... })`.

### 2.3 Rate limit 429

Some routes use `rateLimitError(retryAfter)` from `@babylon/api`; others build the 429 response inline. Use `rateLimitError(retryAfter)` everywhere.

---

## 3. Display name / handle

Same idea in 7+ places: `displayName || username || '…'` (and variants with `farcasterUsername`, `twitterUsername`, `email`, `walletAddress`). Fallback order and default string differ (`'User'`, `'Anonymous'`, `'Unknown'`, `'You'`, `'Agent'`).

| File | Fallback |
|------|----------|
| `Leaderboard.tsx` | `displayName \|\| username \|\| 'Anonymous'` |
| `TradeCard.tsx` | `displayName \|\| username \|\| 'User'` / `'Unknown'` |
| `Sidebar.tsx` | `displayName \|\| email \|\| 'User'` |
| `PortfolioPnLShareCard.tsx`, `CategoryPnLShareCard.tsx` | displayName, username, farcaster, twitter, wallet, then 'Babylon Trader' / 'anon' |
| `useTeamChat.ts` | `displayName \|\| username \|\| 'You'` / `'Agent'` / `'User'` |
| `UserManagementTab.tsx` | `displayName \|\| username \|\| 'Anonymous'` |

**Recommendation:** Add `apps/web/src/lib/user-display.ts` with `getUserDisplayName(user, fallback?)` and `getUserHandle(user)`; use everywhere above for consistent fallbacks and defaults.

---

## 4. Integration test `requireAuth`

Three integration tests each define a local `requireAuth()` that skips/throws when auth env is missing:  
`admin-dashboard-rbac.integration.test.ts`, `growth-metrics-api.integration.test.ts`, `heatmap-api.integration.test.ts`.

**Recommendation:** Export `requireAuth()` from `packages/testing/integration/helpers.ts` (create if needed) and use it in those three files.

---

## 5. Zod schemas

Shared schemas live in `packages/shared/src/validation/schemas/`. No major duplication today; when adding routes, prefer composing shared building blocks (snowflake id, pagination, content length) instead of redefining inline.

---

## 6. DB single-row fetch (optional)

Pattern `.from(table).where(...).limit(1)` → `const [row] = result; if (!row) ...` appears 456 times across api, engine, and web api. Idiomatic Drizzle; optional `findOne` helper only if null-handling repetition becomes a problem.

---

## Summary

| Area | Occurrences | Effort | Impact |
|------|-------------|--------|--------|
| Web currency wrappers | 8 files | Low | Medium |
| Training `.toFixed`/`$` | 5 files | Low | Medium |
| API parse + validate + errors | 35+ routes | Medium | High |
| Cron auth | 20 routes | Low | Low |
| Rate limit 429 | Several | Low | Low |
| Display name / handle | 7+ files | Low | Medium |
| Integration `requireAuth` | 3 files | Trivial | Low |
| DB `.limit(1)` | 456 | Optional | Low |

**Suggested order:** (1) `parseJsonBody` + `errorResponse` on key routes, (2) web `format.ts` helpers and replace 8 wrappers, (3) `getUserDisplayName` / `getUserHandle`, (4) `withCronAuth`, (5) training formatCurrency in the 5 listed files, (6) shared `requireAuth` in tests, (7) optional `findOne` if needed.
