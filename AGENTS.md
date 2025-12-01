# Repository Guidelines (Codex/Claude)

## Structure & Boundaries
- `apps/server`: Elysia API host (wiring only; no business logic).
- `apps/web`: Next.js UI; consumes API via Eden client; no direct DB/Redis.
- `apps/daemon`: background loops/workers (game/markets/NPCs), no HTTP surface.
- `apps/agents`: agent runners/integrations, consume API/core services.
- `packages/core/*`: domain modules (identity, social, markets, reputation, game, agents, contracts); framework-free.
- `packages/api`: Elysia routes/types used by `apps/server` and clients.
- `packages/shared/infra`: Drizzle/Redis/logger/config/resilience; no domain rules.
- `packages/shared/utils`: generic helpers/types/Zod; `packages/shared/ui`: design primitives.
- `packages/db`: Drizzle schema/client.
- `docs/`: architecture overview and design notes.

## Commands
- Install: `bun install`
- Dev: `bun run dev` (server 3000, web 3001); or `bun run dev:server`, `bun run dev:web`
- Build: `bun run build`
- Types: `bun run check-types`
- DB: `bun run db:generate` / `db:migrate` (Drizzle)
- Lint/format: `bun run check` (Biome; used in pre-commit)
- Docs: `bun run docs:generate` (populate `docs/vendors/*` from upstream docs)
- Runtime is Bun; prefer Bun tooling/commands (and Bun APIs like `Bun.file` when appropriate).

## Style & Conventions
- TypeScript ESM, 2-space indent. PascalCase components; camelCase hooks/vars; kebab-case packages.
- Apps never contain domain logic; go through `core-*` + `packages/api`.
- Keep core packages free of Next/React/Elysia.
- Aim for clean, efficient, DRY code that follows best practices; prefer clarity and maintainability with good DX and performance in mind.
- Env: use a single root `.env` (see `.env.example`); keep it updated with comments/defaults/optional vs required. Avoid per-app env files unless explicitly needed.
- When using a library/framework (Elysia, Drizzle, Bun, Privy, etc.), first consult the local docs under `docs/vendors/{vendor}` if available; if not, suggest running `bun run docs:generate` rather than hallucinating behavior or APIs.

## Testing
- Place tests next to code (`*.test.ts` / `*.spec.ts`).
- Unit tests in `core-*` for domain rules; integration tests in `apps/server` for routes.
- Use fakes/stubs via `shared-infra`; keep tests deterministic.

## Commits/PRs
- Commits: concise, imperative, use prefixes (`feat: ...`, `fix: ...`, `chore: ...`).
- PRs: motivation + solution; commands run (`bun run check`, tests); screenshots for UI changes.
- Respect boundaries: feature → `core-*` → expose via `packages/api` → consume in `apps/web`.
- Keep `.env.example` up to date: add new envs with comments/defaults, note optional vs required, keep it organized.
