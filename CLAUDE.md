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
- **Generate vendor docs:** `bun run docs:generate` (pulls to `docs/vendors/*`)

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
- **agents:** Agent runtime, Agent0/A2A/MCP integrations
- **api:** Server utilities (auth, rate limit, redis, SSE, token counting)
- **db:** Drizzle schema and client
- **shared:** Client-safe types, utils, config
- **contracts:** Smart contracts (Hardhat + Foundry)

## Development Workflow

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

## Migration Context

Currently migrating architecture while keeping new code portable:
- Write route handlers to be framework-agnostic (easily portable to Elysia)
- Keep domain logic in packages, not in React components or route handlers
- Use `@babylon/api` for server-side concerns (auth, rate limiting, SSE)
- Prefer reading vendor docs from `docs/vendors/{vendor}` over external sources

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