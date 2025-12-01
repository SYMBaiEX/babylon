# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Core Commands
- Install deps: `bun install`
- Dev: `bun run dev` (server 3000, web 3001) or `bun run dev:server`, `bun run dev:web`
- Build: `bun run build`
- Types: `bun run check-types`
- Lint/format (Biome): `bun run check` (run on staged files via Husky)
- DB (Drizzle/Postgres/Neon): `bun run db:generate`, `bun run db:migrate`
- Docs: `bun run docs:generate` (pull vendor docs into `docs/vendors/*`)
- Runtime is Bun; prefer Bun tooling/commands (Bun APIs like `Bun.file` when appropriate).

## Architecture (modular monolith)
- Runtime: Bun. Backend: Elysia (Eden client for typed calls). Frontend: Next.js 16. DB: Postgres + Drizzle.
- Apps: `apps/server` (API host), `apps/web` (UI), `apps/daemon` (workers), `apps/agents` (agent runners).
- Packages: `core-*` (domain logic), `api` (Elysia routes/types), `shared-infra` (Drizzle/Redis/logger/config), `shared-utils`, `shared-ui`, `db` (schema), docs.
- Dependency flow: apps → core → shared (never reversed). Core is framework-agnostic (no Next/React/Elysia).

## Structure (current)
```
apps/
  server/  # Elysia host
  web/     # Next.js UI
  daemon/  # Background loops/workers (game/markets/NPCs)
  agents/  # Agent runners/integrations
packages/
  api/              # Elysia routes/types
  db/               # Drizzle schema/client
  core/             # Domain logic (framework-free)
    identity/       # Auth/accounts/onboarding/registry
    social/         # Posts/comments/chats/notifications/trending
    markets/        # Markets/pools/perps/wallet accounting
    game/           # Game world/NPCs/simulation
    reputation/     # Reputation/points/rewards/leaderboards
    agents/         # Agent abstractions/strategies
    contracts/      # Contract bindings
  shared/           # Cross-cutting
    infra/          # DB/Redis/logger/config/resilience
    utils/          # Generic helpers/types/Zod
    ui/             # Design primitives
docs/project-architecture-overview.md
```

## Working rules
- Implement domain logic in `core-*`; expose via `packages/api`; consume in `apps/web`.
- No Drizzle/Redis/HTTP inside core; go through `shared-infra` and API layer.
- Keep Elysia routes thin: validate → call use-case → map domain errors to HTTP errors.
- Tests: unit in `core-*`, integration in `apps/server` for routes, E2E later for critical flows.
- Naming: PascalCase components; camelCase hooks/vars; kebab-case packages; 2-space indent.
- Commits: concise, imperative, prefixed (`feat: ...`, `fix: ...`, `chore: ...`).
- Keep `.env.example` current: add new envs with defaults/comments, mark optional vs required, keep it organized.
- Strive for clean, efficient, DRY code that favors clarity, maintainability, good DX, and performance.
- Env: use a single root `.env` (see `.env.example`); avoid per-app envs unless explicitly needed.
- When calling or designing around external libraries/frameworks (Elysia, Drizzle, Bun, Privy, etc.), prefer reading the local vendor docs in `docs/vendors/{vendor}` first; if absent, propose running `bun run docs:generate` instead of guessing APIs or behavior.

## Env (minimal, adjust per app)
- `DATABASE_URL` (Postgres), `CORS_ORIGIN`; add others per feature as needed.

## Workflow reminder
1) Design/extend use-case in the right `core-*`.  
2) Wire API in `packages/api` + `apps/server`.  
3) Consume in `apps/web`.  
4) Add tests at the right layer.  
Keep docs/READMEs updated when boundaries change.
