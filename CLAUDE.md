# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Commands

### Development
- **Start full dev:** `bun run dev` - Starts web server, game engine, and local cron simulator (+ Hardhat/deploy if localnet)
- **Web only:** `bun run dev:web` (via Turbo) or `bun run dev:next-only` (Next.js directly)
- **Build:** `bun run build` - Production build via Turbo
- **Format:** `bun run check` - Auto-fix with Biome (2-space indent, single quotes)
- **Lint:** `bun run lint` - Check via Turbo (must pass with zero warnings)
- **Types:** `bun run typecheck` - Verify TypeScript types

### Testing
- **Unit:** `bun test packages/testing/unit/ --preload ./packages/testing/unit/preload.ts`
- **Integration:** `bun test packages/testing/integration/ --preload ./packages/testing/integration/preload.ts`
- **E2E:** `cd packages/testing && playwright test e2e`
- **Contracts:** `cd packages/contracts && forge test`
- **Single test:** `bun test path/to/test.ts`

### Database (Drizzle + Postgres)
- **Generate migrations:** `bun run db:generate`
- **Run migrations:** `bun run db:migrate`
- **Push schema:** `bun run db:push` (dev only)
- **Studio UI:** `bun run db:studio`
- **Seed data:** `bun run db:seed` or `bun run db:seed:test all`

### Deployment & Operations
- **Deploy contracts:** `bun run deploy:local|testnet|mainnet`
- **CLI tool:** `bun run babylon <command>` (or `bun run apps/cli/src/index.ts`)
- **Generate vendor docs:** `bun run docs:generate` (creates `docs/vendors/*` on first run)

## Architecture Overview

**Modular monolith** with Bun runtime, moving from Next.js to Elysia:
- **Current state:** Next.js hosts UI + API routes/SSE/A2A in `apps/web`
- **Target state:** Elysia server in `apps/server`, workers in `apps/daemon`, domain split into `packages/core/*`

### Package Dependencies
```
apps/* → packages/* → contracts
```
- Apps import from packages (engine, agents, api, db, shared)
- Packages import shared utilities and contracts
- No circular dependencies allowed

### Key Packages
- **engine:** Game world, perpetuals, simulation logic (domain)
- **agents:** Agent runtime, autonomous execution, multi-step actions
- **core:** Market services (perps, prediction), shared domain logic
- **api:** Server utilities (auth, rate limit, redis, SSE, token counting)
- **db:** Drizzle schema and client
- **shared:** Client-safe types, utils, config
- **contracts:** Smart contracts (Hardhat + Foundry)
- **a2a:** Agent-to-Agent protocol integration
- **mcp:** Model Context Protocol server
- **training:** Agent training pipelines

## Development Workflow

### Critical Rules (High Priority)

**NEVER add co-authoring to commits.** Do not include `Co-Authored-By` lines or any AI attribution in commit messages.

**ALWAYS target `staging` branch for PRs.** Never open PRs against `main` - all PRs go to `staging`.

**ALWAYS wait for AI reviewer feedback.** After creating a PR, stop and wait for `claude[bot]` and `coderabbitai[bot]` to complete their reviews. Do not proceed or merge until review comments are addressed.

**ALWAYS prefer parallel agents.** When facing multiple independent tasks, use the Task tool to spawn parallel agents instead of working sequentially. This maximizes efficiency.

### Before Marking Work Complete
**CRITICAL:** Run these commands in sequence:
1. `bun run typecheck` - Must pass
2. `bun run lint` - Must have zero warnings
3. `bun run build` - Must build successfully

Only consider work done after all three pass without errors.

### Code Standards
- **No defensive try/catch:** Fail fast, handle errors at boundaries
- **No `any` or `unknown`:** Research proper types, use shared types from `@babylon/shared`
- **No unnecessary files:** Don't create docs/README unless explicitly requested
- **Integration over unit tests:** Test against running backend, avoid mocks
- **Keep handlers thin:** Validate → call service → map errors (portable to Elysia)
- **Domain stays pure:** No DB/Redis/HTTP in domain modules

### Environment Setup
1. Copy `.env.example` to `.env`
2. Run `scripts/pre-dev/pre-dev-local.ts` for localnet defaults
3. Key variables:
   - `DATABASE_URL` - Postgres connection
   - `NEXT_PUBLIC_PRIVY_APP_ID` - Auth
   - `GROQ_API_KEY` or `OPENAI_API_KEY` - AI models
   - `CRON_SECRET` - For cron endpoints
   - `GAME_START` - Control game state (pause/running)

### Git Workflow
- **Commits:** Imperative mood, prefixed (`feat:`, `fix:`, `chore:`)
- **Main branch:** `staging` (not `main`)
- **Pre-commit:** Biome format check via Husky
- **PR maintenance:** Update PR title and description after each commit if scope changes. Use `gh pr edit <number> --title "..." --body "..."` to keep the PR summary accurate.

### PR Review Process
- PRs are automatically reviewed by `claude[bot]` and `coderabbitai[bot]`
- Wait for both reviews before merging
- Address review comments or explain design decisions by tagging `@claude`
- If reviewers disagree with intentional design choices, consult by commenting with rationale

### Parallel Development
- Use git worktrees for independent fixes: `git worktree add ../path branch-name`
- Can run multiple fixes in parallel when issues don't overlap
- Each worktree gets its own feature branch → separate PR

### Code Patterns

**Trust the Schema**
- If column has `.notNull().default()`, don't add defensive null checks
- Fail fast on invariant violations rather than masking with defaults

**Drizzle Decimal Comparisons**
```typescript
// ❌ String comparison bug: "100" < "9"
gte(decimalColumn, String(amount))

// ✅ Proper numeric comparison
gte(sql<number>`${decimalColumn}::numeric`, amount)
```

**Avoid N+1 Queries**
```typescript
// ❌ Query per iteration
for (const item of items) {
  const data = await db.select().where(eq(table.id, item.id));
}

// ✅ Batch fetch + Map lookup
const allData = await db.select().where(inArray(table.id, ids));
const dataMap = new Map(allData.map(d => [d.id, d]));
```

**Rate-Limited Resources**
- Charge/deduct after lock acquisition, before execution
- Prevents abuse via intentional errors to get free actions

## Migration Context

Currently migrating architecture while keeping new code portable:
- Write route handlers to be framework-agnostic (easily portable to Elysia)
- Keep domain logic in packages, not in React components or route handlers
- Use `@babylon/api` for server-side concerns (auth, rate limiting, SSE)
- Prefer reading vendor docs from `docs/vendors/{vendor}` over external sources (run `bun run docs:generate` first if directory doesn't exist)

## Real-time Features
- **SSE (Server-Sent Events):** For feed updates, market prices, news, chat
- **Redis broadcasting:** Optional for production (Upstash Redis for Vercel)
- **Game ticks:** Via cron job (`/api/cron/game-tick`) or local simulator
- **Lookahead generation:** Maintains 15-minute content buffer

## Testing Philosophy
- Test against real backend (database, services running)
- Integration tests over unit tests (less mocking, more confidence)
- Use test database for isolation
- E2E for critical user flows only

## Common Pitfalls to Avoid
- Don't pipe commands in terminal (harder to debug)
- Don't create files unless necessary (prefer editing existing)
- Don't use bash for file operations (use dedicated Read/Write/Edit tools)
- Don't ignore linter issues from other work-in-progress
- Always check existing code before writing new implementations

## Production Operations

### Game Control

**Pause/Resume via Environment:**
```bash
# Pause game (skips all ticks)
GAME_START=false

# Resume game (default behavior)
GAME_START=true  # or unset
```

**Pause/Resume via Database:**
```sql
-- Pause game
UPDATE "Game" SET "isRunning" = false, "pausedAt" = NOW() WHERE "isContinuous" = true;

-- Resume game
UPDATE "Game" SET "isRunning" = true, "pausedAt" = NULL WHERE "isContinuous" = true;
```

**Via API:**
```bash
# Control game state
curl -X POST https://your-domain/api/game/control \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}'  # or "start"
```

### Cron Job Configuration

All cron jobs are defined in [`vercel.json`](vercel.json):

| Job | Schedule | Purpose |
|-----|----------|---------|
| `game-tick` | Every minute | Content generation, question resolution |
| `npc-tick` | Every minute | NPC trading decisions |
| `agent-tick` | Every minute | Autonomous agent actions |
| `realtime-drain` | Every minute | Flush SSE outbox to Redis |
| `health-check` | Every 5 minutes | Cron health monitoring |
| `training-check` | Hourly | Check training job status |
| `reputation-sync` | Daily 2am | Sync reputation to blockchain |
| `perp-funding` | Every 8 hours | Calculate perpetual funding rates |
| `world-facts` | Every 6 hours | Fetch RSS feeds, generate parody headlines |

**Relay to Staging:**
Set `REDIRECT_CRON_STAGING=true` to forward production cron calls to staging for testing.

### Health Checks

**Verify cron health:**
```bash
curl -X GET https://your-domain/api/cron/health-check \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Check game state:**
```bash
curl -s https://your-domain/api/health
# Returns: {"status":"ok","timestamp":"...","env":"production"}
```

**View cron metrics (admin):**
```bash
curl -X GET https://your-domain/api/admin/cron-metrics \
  -H "x-admin-token: $ADMIN_TOKEN"
```

### Troubleshooting Runbook

**Cron not firing:**
1. Check `vercel.json` has the cron entry
2. Verify `CRON_SECRET` is set in Vercel environment
3. Check Vercel dashboard → Cron Jobs tab for execution history
4. Review function logs for auth failures

**Content not generating:**
1. Check game is running: `SELECT "isRunning" FROM "Game" WHERE "isContinuous" = true`
2. Verify active questions exist: `SELECT COUNT(*) FROM "Question" WHERE status = 'active'`
3. Check lookahead buffer: `SELECT MAX(timestamp) FROM "Post"` should be 15+ min ahead
4. Review game-tick logs for errors

**Agents not trading:**
1. Verify game is running (see above)
2. Check agent configs: `SELECT * FROM "UserAgentConfig" WHERE "autonomousTrading" = true`
3. Verify agent has sufficient points: `pointsBalance >= 1`
4. Check agent-tick logs for lock contention or errors

**Lock contention (frequent "lock held" messages):**
1. This is expected if ticks take > 1 minute
2. Check tick duration in logs
3. If consistently slow, investigate which phase is slow:
   - Content generation (LLM calls)
   - NPC trading decisions
   - Question resolution
4. Consider increasing tick interval or optimizing slow operations

### Critical Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Production | Cron auth (fail-closed if missing) |
| `DATABASE_URL` | Yes | Postgres connection string |
| `DIRECT_DATABASE_URL` | Recommended | Direct DB connection (bypasses pooler) |
| `GAME_START` | No | Set to `false` to pause all game activity |
| `REDIRECT_CRON_STAGING` | No | Set to `true` to relay crons to staging |
| `GROQ_API_KEY` | Yes | LLM provider for content generation |
| `OPENAI_API_KEY` | Fallback | Alternative LLM provider |

### Monitoring Alerts

Configure alerts for:
- **Game tick failure:** 3+ consecutive failures → critical
- **Agent tick timeout:** > 600s execution → warning
- **No content generated:** 30+ minutes without new posts → warning
- **Lookahead buffer low:** < 5 minutes ahead → critical
- **Database connection failures:** Any connection error → critical