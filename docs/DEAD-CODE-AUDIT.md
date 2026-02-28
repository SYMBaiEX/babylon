# Dead Code Audit Report

**Generated:** 2026-02-27  
**Tool:** [knip](https://github.com/webpro/knip) v5.80.2  
**Command:** `bunx knip --no-progress`

This report summarizes unused files, dependencies, exports, and related issues across the monorepo. It has been manually verified against the codebase to correct knip false-positives. **3 unresolved imports were fixed** during the audit.

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Unused files | 371 | Most are false-positives (tests/scripts/docs); focus on `apps/web` only |
| Unused dependencies | 53 | Many confirmed false-positives (see §2 for vetted list) |
| Unused devDependencies | 22 | Mix of false-positives and real candidates |
| Unlisted dependencies | 30 | **Real issue** – add to correct `package.json` |
| Unresolved imports | 3 | **Fixed** (see below) |
| Unused exports | 239 | Many are public API surface; see §6 for action |
| Unused exported types | 385 | Same |
| Unused enum members | 13 | Optional cleanup |
| Duplicate exports | 9 | Mix of intentional aliases and true duplication |

---

## Fixes Applied

### Unresolved imports (verified and fixed)

1. **`packages/agents/src/plugins/plugin-trajectory-logger/src/__tests__/art-format-validation.test.ts`**  
   - Was: `../../../types/common` (resolves inside `src/`, not `packages/agents/src/`)  
   - Fixed: `../../../../types/common` (verified resolves to `packages/agents/src/types/common.ts`)

2. **`packages/engine/src/__tests__/trending-news-integration.test.ts`**  
   - Was: `../../engine/llm/openai-client` → Fixed: `../llm/openai-client`  
   - Was: `../../shared/types` → Fixed: `../types/shared` (engine's `types/shared.ts` re-exports `@babylon/shared`)

---

## 1. Unused files (371)

Knip treats any file unreachable from configured entry points as "unused." Without a knip config, test runners, CLI scripts, docs, and Next.js entry points are all invisible to it, producing widespread false-positives. **The real actionable list is much shorter.**

### False-positives (do not delete)

- **`packages/testing/**`** – All integration/unit/e2e/manual/performance/simulation files are run by `bun test` or Playwright. Not used by knip's module graph, but definitely used.
- **`scripts/**`** – Operational scripts invoked via `bun run` or the CLI. Active and intentional.
- **`apps/docs/content/**/_meta.ts`** – Navigation metadata consumed by the docs framework (Nextra/Fumadocs). Required.
- **`packages/db/drizzle/**`** – Drizzle migration schema/relations files; consumed by the migration tooling, not the module graph.
- **`packages/examples/**`** – Demo code. Keep.
- **`packages/training/book/mermaid*`** – Static assets for the training book.

### Worth investigating

- **`apps/web`** – Several component trees appear genuinely orphaned. Confirm by tracing from Next.js routes:
  - `src/app/markets/_components/**` – Entire markets page component set (cards, sections, tabs, hooks). Check if `/markets` route still renders them.
  - `src/components/admin/**` – `ChartRenderer`, `FilterPanel`, `MetricCards`. Check admin pages.
  - `src/components/agents/**` – `AgentChat`, `AgentDetail`, `AgentPerformance`, `AgentPnLDisplay`, `AgentSettings`, `AgentWallet`. Possibly replaced.
  - `src/components/reputation/**` – Full folder. Check if reputation UI is active.
  - `src/components/waitlist/**` – Full waitlist dashboard. Verify if waitlist flow is still live.
  - `src/components/npc/**` – `NPCLeaderboard`, `NPCPortfolioCard`.
  - `src/hooks/useWaitlistData.ts`, `useSocialVerification.ts`, `useTwitterAuth.ts`, `useAgent0Reputation.ts`, `useAgentTotalPnL.ts`.
  - `apps/web/webpack-electron-fetch-stub.js`, `webpack-electron-stub.js` – Electron stubs. Used?
  - `src/app/sw.ts` – Service worker. **Note: it uses `serwist`; see §2 re serwist false-positive.**

- **`packages/agents`** – `a2a-client-integration.ts`, `autonomous-agent-setup.ts`, and the `plugin-experience` utils (`experienceAnalyzer.ts`, `experienceFormatter.ts`) may be genuinely orphaned if those features were removed. Confirm usage.

- **`packages/api`** – `monitoring/index.ts`, `storage/index.ts`. Confirm no dynamic import or CLI path reaches them.

**Recommendation:**  
Add a `knip.json` (see §9) first, then re-run. The "unused files" count will drop significantly, revealing the real targets.

---

## 2. Unused dependencies (53) — vetted

Knip reported 53 unused dependencies. Manual spot-checks reveal several are **false-positives**:

### Confirmed false-positives (keep)

| Package | Reason |
|---------|--------|
| `clsx`, `tailwind-merge` (in **apps/web**) | **Not false-positives:** `cn()` is implemented in `@babylon/shared` (which has its own clsx/tailwind-merge). apps/web imports `cn` from `@babylon/shared` and does not use clsx/tailwind-merge directly. **Safe to remove from apps/web** as redundant; keep in `packages/shared`. |
| `geist` | Referenced in `apps/web/tailwind.config.ts` as `var(--font-geist-sans)` / `var(--font-geist-mono)`. If your root layout never sets these CSS variables (e.g. via `next/font` or the geist package), the package may be removable; otherwise keep. |
| `serwist` | Used in `apps/web/src/app/sw.ts` and `apps/web/next.config.ts`; knip misses SW entry. Keep. |
| `html-to-image` | Dynamic `import('html-to-image')` in `PnLShareModal.tsx` – knip can't track dynamic imports. Keep. |
| `autoprefixer` | PostCSS config tool; used by Tailwind build pipeline, not imported in TS. Keep. |
| `lint-staged` (root) | Declared in root `package.json` `lint-staged` config key; used by husky. Keep. |
| `drizzle-kit` (apps/web devDep) | DB tooling is in `packages/db`; apps/web does not import it. **Remove from apps/web**; keep in `packages/db`. |

### Likely real candidates (verify before removing)

#### `apps/web`

| Package | Evidence |
|---------|---------|
| `clsx`, `tailwind-merge` | Not imported in apps/web; `cn()` comes from `@babylon/shared` which already depends on them. Remove from apps/web as redundant. |
| `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` | No imports found in `apps/web/src`; possibly leftover from image upload feature |
| `@elizaos/plugin-sql` | No imports found in `apps/web/src` |
| `@fal-ai/client` | No imports found |
| `@farcaster/auth-kit` | No imports found (Farcaster handled via MiniApp provider, not this kit) |
| `@hookform/resolvers`, `react-hook-form` | No imports found (`register()` found is `posthog.register`, not react-hook-form) |
| `@langchain/anthropic`, `@langchain/core`, `@langchain/openai` | No imports found |
| `@privy-io/wagmi`, `wagmi` | No imports found in `apps/web/src` |
| `ajv`, `ajv-formats` | No imports found |
| `drizzle-zod` | No imports found |
| `graphql` | No imports found in `apps/web/src` |
| `ipfs-http-client`, `multiformats` | No imports found |
| `ox` | No imports found |
| `xml2js` | No imports found |
| `@vercel/blob`, `@vercel/kv` | No imports found; may have been removed from web layer |
| `@t3-oss/env-nextjs` | No imports found |
| `ws` (apps/web) | No imports found in `apps/web/src` |

> **Radix UI** packages (`@radix-ui/react-avatar`, `react-checkbox`, `react-dialog`, `react-label`, `react-popover`, `react-radio-group`, `react-select`, `react-separator`, `react-slider`, `react-slot`, `react-toast`, `react-tooltip`): these may be used only inside unused component files (listed in §1). Verify by checking whether those component files are themselves deleted first.

#### Root `package.json`

| Package | Evidence |
|---------|---------|
| `ioredis` | Used at runtime in API/server; likely belongs in `packages/api` not root |
| `openai` | Used in engine/agents; likely belongs in those packages, not root |
| `import-in-the-middle`, `require-in-the-middle` | OpenTelemetry polyfills; verify if APM is active |
| `ws` | Used in several packages; belongs in those packages, not root |

#### Other packages

| Package | Evidence |
|---------|---------|
| `@babylon/contracts` (packages/a2a) | No import found in a2a source; possibly leftover |
| `hono` (packages/engine) | No imports found in engine source; possibly leftover |
| `@babylon/contracts` (packages/testing, packages/examples) | Verify if any test/example file imports it |

**Recommendation:** Remove the "likely real" candidates one workspace at a time, verify the build passes, then commit. Do not remove confirmed false-positives.

---

## 3. Unused devDependencies (22)

| Package | Verdict |
|---------|---------|
| `lint-staged` (root) | **Keep** – used in `package.json` config |
| `autoprefixer` (apps/web) | **Keep** – PostCSS pipeline |
| `@prb/math` (root) | Investigate – math library for Solidity tests; verify if contracts tests still need it |
| `@types/js-yaml` | Investigate – check if yaml is parsed anywhere |
| `baseline-browser-mapping` | Investigate – likely for compatibility tooling |
| `madge` | **Likely unused** – circular dependency checker; remove if not in any script |
| `sharp` | **Likely unused** from root; may belong in `apps/web` for image optimization |
| `graphql-request` (packages/agents) | Investigate – no graphql calls found in agents |
| `ioredis` (packages/agents) | **Likely misplaced** – if used, move to `packages/api` |
| `swagger-jsdoc` (apps/docs, apps/web) | Investigate – verify if OpenAPI docs are generated |
| `zod-validation-error` (apps/docs) | Investigate |
| `vitest` (packages/examples/local-a2a-server) | Tests use bun; remove |
| `@synthetixio/synpress` (packages/testing) | Investigate – Web3 E2E framework; verify if any synpress tests exist |
| `nanoid` (packages/testing) | No import found in tests; remove |
| `stripe` (packages/testing) | Verify – stripe tests may be integration tests needing the real SDK |
| `@types/ws`, `@types/xml2js`, `@types/swagger-jsdoc` (apps/web) | Remove if parent packages are removed |
| `drizzle-kit` (apps/web devDep) | **Keep** in `packages/db`; remove from `apps/web` |

---

## 4. Unlisted dependencies (30) — action required

These are **real issues**: code imports packages not declared in the workspace's own `package.json`. This can break installs in clean environments.

| Import | Location | Fix |
|--------|----------|-----|
| `@babylon/core` | `packages/a2a/src/executors/babylon-executor.ts` | Add to `packages/a2a/package.json` |
| `@babylon/engine` | `packages/a2a/src/executors/babylon-executor.ts` | Add to `packages/a2a/package.json` |
| `@babylon/agents` | `packages/api/src/services/onchain-service.ts` | Add to `packages/api/package.json` |
| `vitest` | `packages/engine/src/__tests__/` (multiple) | Replace with `bun:test` or add vitest to engine devDeps |
| `@babylon/core` | `packages/mcp/src/handlers/tool-handlers.ts` | Add to `packages/mcp/package.json` |
| `@babylon/db`, `@babylon/engine`, `@babylon/shared` | `scripts/*.ts` | Add to root `package.json` or document as workspace dependencies |
| `@privy-io/node` | `scripts/export-newsletter-users-csv.ts`, `scripts/setup-privy-offline-controls.ts` | Add to root `package.json` |
| `nanoid` | `scripts/seed-nft-snapshot-csv.ts`, `scripts/seed-test-data.ts` | Add to root `package.json` |

---

## 5. Unlisted binaries (11)

Referenced in scripts or config but not declared as npm dependencies: script `scripts/validation/check-environment.ts` (invoked from CI), and system tools `docker-compose`, `forge`, `cast`, `vercel`, `slither`, `uv`, `lsof`.

**Recommendation:** Document required system tools in `CONTRIBUTING.md` or a setup script. The script is a repo file; the rest cannot be added to `package.json`.

---

## 6. Unused exports (239) and unused exported types (385)

Large counts but require case-by-case judgment.

### High-priority removals (clearly dead)

- **`validateNoRealNamesStrict`** (`packages/engine/src/prompts/validate-output.ts`) – Explicitly marked `@deprecated`, is an alias for `validateNoRealNames`. It **is** used in `packages/engine/src/prompts/index.ts` and one test, but only because those callers re-alias it back to `validateNoRealNames`. Remove and update the 2 callers.
- **`TokenStatsService`** (deprecated alias in `token-stats-service.ts`) – Marked `@deprecated`, alias for `tokenStatsService`. It **is** used in 4 places: `packages/engine/src/game-tick.ts`, `apps/web/src/app/api/stats/tokens/route.ts`, and two test files (`token-stats.test.ts`, `token-stats-integration.test.ts`). Update all 4 to use `tokenStatsService` and remove the alias.
- **`getDbInstance` default export** (`packages/db/src/database-service.ts`) – `export default getDbInstance` on top of the named export. All consumers import the named export (`import { getDbInstance } from '@babylon/db'`); the default export is unused. Safe to remove.

### Medium-priority (apps/web)

Many unused exports in `apps/web` are in the component files already flagged as unused in §1 (markets, waitlist, reputation, agents). Removing those files eliminates the export issues automatically.

### Low-priority / keep (public API surface)

- **`packages/db` model types** (`model-types.ts`) – All the `New*` and entity types are the DB package's public API. Keep unless you restrict the surface deliberately.
- **`packages/engine` types** (perps, shared, game-context-builder) – Used externally by consumers of `@babylon/engine`. Keep.
- **`packages/testing` helpers** (synpress, test-data) – Used by test files that aren't in knip's module graph.

---

## 7. Unused exported enum members (13)

| Member | Location | Verdict |
|--------|----------|---------|
| `ErrorCode.*` (8 members) | `packages/a2a/src/types/a2a.ts` | Keep – part of A2A protocol; may be consumed by external agents |
| `AuthMethod.MUTUAL_TLS` | `packages/agents/src/external/ExternalAgentAdapter.ts` | Investigate – if mTLS is unimplemented, remove |
| `MCPMethod.RESOURCES_LIST/READ/PROMPTS_LIST/GET` | `packages/mcp/src/types/mcp.ts` | Investigate – MCP spec requires these; keep if server will implement them |

---

## 8. Duplicate exports (9) — vetted

Knip flags these as "duplicate exports" because the same symbol is exported under two names. Manual review:

| Symbol | Type | Verdict |
|--------|------|---------|
| Plugin defaults (6 entries) | `namedExport \| default` | **Intentional** – ElizaOS plugin convention requires a default export alongside a named export. Keep. |
| `getDbInstance \| default` | Named + default export of same fn | **Remove default** – No consumer uses the default; all use named import. |
| `validateNoRealNames \| validateNoRealNamesStrict` | Deprecated alias | **Remove alias** – Update 2 callers, then remove `validateNoRealNamesStrict`. |
| `tokenStatsService \| TokenStatsService` | Deprecated alias | **Remove alias** – Update 4 callers (game-tick.ts, route.ts, 2 tests), then remove `TokenStatsService`. |

---

## 9. Knip configuration (add this)

Without a config, knip doesn't know about Next.js routes, bun test patterns, or CLI scripts. This causes the 371 "unused file" count to be inflated with false-positives. Add a `knip.json` at the repo root:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      "entry": ["scripts/**/*.ts", "apps/cli/src/index.ts"]
    },
    "apps/web": {
      "next": true
    },
    "apps/docs": {
      "entry": ["app/**/*.tsx", "content/**/*.ts", "content/**/*.mdx"]
    },
    "packages/testing": {
      "entry": [
        "integration/**/*.test.ts",
        "unit/**/*.test.ts",
        "e2e/**/*.ts",
        "performance/**/*.ts",
        "manual/**/*.ts",
        "deployment/**/*.ts",
        "**/preload.ts",
        "**/setup.ts",
        "synpress/**/*.ts"
      ]
    },
    "packages/engine": {
      "entry": ["src/index.ts", "src/**/__tests__/**/*.test.ts"]
    },
    "packages/training": {
      "entry": ["scripts/**/*.ts", "src/**/*.ts"]
    }
  }
}
```

After adding this, re-run knip. The "unused files" count should drop by 200+.

---

## Suggested next steps (ordered by impact)

1. **Add `knip.json`** (§9) and re-run to get a clean baseline.
2. **Fix unlisted dependencies** (§4) – Add missing workspace deps to the appropriate `package.json` so CI installs are reliable.
3. **Remove 3 deprecated aliases** (§8):
   - `export default getDbInstance` in `packages/db/src/database-service.ts`
   - `validateNoRealNamesStrict` in `packages/engine/src/prompts/validate-output.ts` (update 2 callers: `prompts/index.ts` + 1 test)
   - `TokenStatsService` alias in `packages/engine/src/services/token-stats-service.ts` (update 4 callers: `game-tick.ts`, `route.ts`, 2 tests)
4. **Remove confirmed-unused `apps/web` dependencies** (§2 "likely real" list) one at a time, verify build after each removal.
5. **Audit and delete orphaned `apps/web` UI** (§1 "worth investigating") – start with `markets/_components`, `waitlist`, `reputation`.
6. **Remove `@babylon/contracts`** from `packages/a2a`, `packages/testing`, `packages/examples` if confirmed unused.
7. **Remove `hono`** from `packages/engine` if no Hono server is used there.

---

## How to re-run

```bash
bunx knip --no-progress
# or save to file for diffing:
bunx knip --no-progress 2>&1 | tee docs/knip-report.txt
```
