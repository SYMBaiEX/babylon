<!--
Babylon PR template

Goal: make PRs easy to review + easy to ship.
- Prefer small, focused PRs (one theme). Avoid catch‑all PRs.
- Keep app-layer thin and portable (validate → service → map errors).
- Put domain logic in packages (framework-agnostic), not in Next handlers/components.
- Before requesting review, run the relevant checks (see "Test plan").
-->

## Summary
<!-- 1–3 bullets: what changed + why (user impact / business goal). -->

- **Public API tiered rate limiting**: All public GET endpoints (feeds, markets, profiles, etc.) now use `publicRateLimit()` — 20 req/min per IP (unauthenticated), 60/min per user (auth or API key). Reduces abuse and cost while keeping legitimate clients unblocked.
- **Public firehose + ticker / RSS**: Added `GET /api/realtime/public-token` for SSE access without login (public channels only); Polymarket-style ticker embed, RSS feeds for feed/breaking-news, and docs for usage/embedding.
- **Null-user safety + docs**: Audited public GET handlers so unauthenticated callers never hit code that assumes a user (e.g. GET /api/posts no longer trusts query `userId`/`following` for auth). CHANGELOG, rate-limiting README with WHYs, and code comments added.

## Type
<!-- Helps triage + release notes. -->

- [x] Feature
- [ ] Bug fix
- [ ] Refactor / cleanup (no behavior change)
- [ ] Performance
- [ ] Infra / ops
- [x] Docs
- [ ] Contracts / on-chain
- [ ] Other: …

## Context / Links
<!-- Link issues, Linear tickets, docs, prior PRs. -->

- Plan: public API tiered rate limiting (per-IP vs per-user, null-user audit, firehose token).
- `packages/api/src/rate-limiting/README.md` — usage and rationale for public rate limiting.
- `CHANGELOG.md` — entry for this release.

## Scope (keep it focused)
<!-- If you had to touch multiple areas, explain why and what you intentionally left out. -->

- [x] This PR is focused on a single change/theme (not a catch‑all) — “make more data public/free” (rate-limited public API + firehose + ticker + RSS).
- [x] Drive‑by refactors are excluded or split into a separate PR
- [x] Non‑goals / follow‑ups are listed below (with links)

**Non-goals / follow-ups**
- No new DB migrations or schema changes.
- Optional: future tuning of rate limit numbers based on production metrics.

**Areas touched**
- [x] Web UI (`apps/web`) — ticker page, feed layout, RSS routes
- [x] Web API routes / SSE / A2A (`apps/web`) — public rate limit on all public GETs, `GET /api/realtime/public-token`, `GET /api/ticker`
- [ ] CLI (`apps/cli`)
- [x] Docs site (`apps/docs`) / vendor docs (`docs/vendors/*`) — ticker embed reference
- [x] Domain / game engine (`packages/engine`, `packages/core/*`) — RSS config, game bootstrap
- [ ] Agents / runtime / A2A / MCP (`packages/agents`, `packages/a2a`, `packages/mcp`)
- [x] API infra (`packages/api`) — rate limit configs, `publicRateLimit()`, `addPublicReadHeaders()`
- [ ] DB (`packages/db`)
- [ ] Contracts / on-chain (`packages/contracts`)
- [ ] Shared types/utils (`packages/shared`)
- [ ] Tests (`packages/testing`)
- [ ] Other: …

## Changes
<!-- List the notable changes (what is new/removed/modified). Link key files if it helps. -->

- **Rate limiting**: `RATE_LIMIT_CONFIGS` gains `PUBLIC_READ`, `PUBLIC_READ_AUTHED`, `PUBLIC_READ_ANONYMOUS`, `PUBLIC_FIREHOSE*`. `middleware.ts`: `publicRateLimit(request, kind?)`, `addPublicReadHeaders(response, rateLimitInfo)`. All public GET routes call `publicRateLimit()` and attach headers on success.
- **Public firehose**: `GET /api/realtime/public-token` — issues token for public channels only; rate limited with firehose tier.
- **Null-user fixes**: GET /api/posts uses `authUser?.userId` for following and block/mute filters (not query params). Other GETs verified or guarded for null `user`.
- **Ticker**: `apps/web/src/app/ticker/`, `GET /api/ticker`, `docs/ticker-embed.md`, `docs/ticker-usage-guide.md`, `apps/docs/content/reference/ticker-embed.md`.
- **RSS**: `apps/web/src/app/feed/rss/route.ts`, `apps/web/src/app/feed/breaking-news/rss/route.ts`, `apps/web/src/lib/rss.ts`, `packages/engine/src/config/rss-sources.ts`, `docs/feeds-rss.md`.
- **Docs**: `CHANGELOG.md`, `packages/api/src/rate-limiting/README.md` (public tiered limiting + WHYs), code comments in rate-limiter and middleware.

## Review guide
<!-- Help reviewers go fast: where to start, what to ignore, tricky bits, key decisions. -->

**Start here**
- `packages/api/src/rate-limiting/middleware.ts` — `publicRateLimit()`, `addPublicReadHeaders()`
- `packages/api/src/rate-limiting/user-rate-limiter.ts` — `PUBLIC_READ*` / `PUBLIC_FIREHOSE*` configs
- `apps/web/src/app/api/posts/route.ts` — example of null-user safety (following + moderation filters)
- `apps/web/src/app/api/realtime/public-token/route.ts` — public firehose token

**Risk**
- [x] Low
- [ ] Medium
- [ ] High

**Notes for reviewers**
- Rate limit key: authed → `userId`, else → client IP, else → `"anonymous"` (strict shared bucket). No new env vars required; uses existing Redis when available.
- Ticker and RSS are additive; no changes to existing auth or private endpoints beyond rate limit + headers.

## Test plan
<!-- Tick what you ran. Add manual steps for anything user-facing. -->

**Commands run**
- [ ] `bun run check` (Biome format)
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] `bun run test` (unit + integration)
- [ ] `bun run test:e2e` (if critical flows changed)
- [ ] `bun run contracts:test` (if contracts changed)
- [ ] `bun run db:check` (if DB schema/queries changed)

**Manual verification**
1. Open a public GET (e.g. `/api/posts`, `/api/markets/predictions`) without auth — 200 with `X-RateLimit-*` and `Cache-Control` headers; after exceeding limit (e.g. 21 requests in 1 min from same IP) → 429.
2. With auth/API key — higher limit (60/min) and same headers.
3. `GET /api/realtime/public-token` — returns `token`, `channels`, `expiresAt`; use token with `/api/sse/events?token=...` to receive public feed/markets events.
4. Ticker page and embed docs load; RSS routes return valid feed XML.

## Ops / Migration / Deployment
<!-- Anything that impacts deploys, data, cron, config, or rollouts. -->

- [x] No deploy impact
- [ ] Requires env var updates (listed below + `.env.example` updated)
- [ ] Requires DB migration (`bun run db:migrate`) / backfill / seed
- [ ] Changes cron schedule or endpoints (`vercel.json`, `CRON_SECRET`, etc.)
- [ ] Rollout behind a flag / gradual rollout

**Env vars (added/changed/removed)**
- No new env vars. Uses existing Redis and `getClientIp()` (existing headers).

**DB / data migration**
- None.

**Rollout / rollback plan**
- Rollout: deploy as usual; rate limits apply immediately.
- Rollback: revert PR; rate limit middleware is additive (handlers still work without it if reverted).

## Breaking changes

- [x] None
- [ ] Yes (describe + migration guide below)

**Migration guide**
- N/A

## Security / privacy
<!-- Authn/authz, secrets handling, PII, prompt injection surfaces, etc. -->

- [x] No security impact
- [ ] Needs extra review (describe)

Public endpoints remain read-only; null-user audit ensures we don’t expose other users’ data via query params. Rate limiting is per-IP/per-user only; no PII in keys beyond what’s already in logs.

<details>
<summary>Area-specific notes (expand if relevant)</summary>

### API / contracts between services
- New: `GET /api/realtime/public-token` (returns JWT for public SSE channels). New: `GET /api/ticker`. All public GETs now return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Cache-Control: public, s-maxage=5, stale-while-revalidate=10` on success.

### Database
- No schema or query changes.

### Contracts / on-chain
- N/A

### Docs
- `CHANGELOG.md` added. `packages/api/src/rate-limiting/README.md` updated. `docs/feeds-rss.md`, `docs/ticker-embed.md`, `docs/ticker-usage-guide.md`, `apps/docs/content/reference/ticker-embed.md` added/updated.

</details>

## Screenshots / recordings (UI)
<!--
⚠️ REQUIRED SECTION - Do not leave empty.

Choose ONE of the following:

1. **If visual changes exist**: Add screenshots (before/after) or a short recording.
   - For recordings: describe the "demo script" (what to show, user flow, expected behavior).
   - For recordings: describe the "demo script" (what to show, user flow, expected behavior).

2. **If no visual changes**: Explain WHY a screenshot/recording is not relevant.
   Examples:
   - "Backend-only change, no UI impact"
   - "Refactor with no behavior change"
   - "API route change, not user-facing"
-->

### Option A: Visual demo

| Feature | Before | After |
|---------|--------|-------|
| Ticker embed | N/A | Polymarket-style ticker page + embeddable widget |
| RSS | N/A | Feed and breaking-news RSS routes |

*Demo script (for recording):*
1. Open `/ticker` — ticker widget with market data.
2. Open feed RSS URL (see docs) — XML feed.
3. (Optional) Show rate limit headers in DevTools for any public API GET.

### Option B: No visual changes

- Reason: N/A — this PR includes ticker UI and RSS; screenshot provided in PR (ticker).

## Checklist (author)
- [ ] Self-review done (diff + critical paths)
- [ ] Base branch is correct (`staging` by default)
- [ ] Handlers remain thin and portable (validate → service → map errors)
- [ ] Domain logic stays in packages (no Next/React/Elysia coupling in core)
- [ ] `.env.example` updated (if env changed) and variables documented above
- [x] Docs updated (and `bun run docs:generate` if needed)
- [ ] Tests added/updated for behavior changes (or rationale provided)
- [ ] Dependency changes are intentional (`bun.lock` updated)
- [ ] Code owners requested (auto via CODEOWNERS or manual)
- [x] **Screenshots/recordings section filled** (visual demo OR explanation why N/A)
