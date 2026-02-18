# Changelog

All notable changes to the Babylon project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Outbound RSS feeds**
  - **Why**: Let users and tools subscribe to Babylon content (hot posts, breaking news) in standard RSS readers without duplicating feed logic.
  - **GET /feed/rss**: RSS 2.0 feed of hot posts. Reuses `/api/feed/hot` internally so scoring, caching, and filtering stay in one place; this route only converts JSON → XML.
  - **GET /feed/breaking-news/rss**: RSS 2.0 feed of breaking news (world events, org updates, actor posts). Reuses `/api/feed/widgets/breaking-news` the same way.
  - Shared RSS builder in `apps/web/src/lib/rss.ts` (RSS 2.0 XML with escaping, RFC 1123 dates, 5‑min cache headers). **Why single helper**: Consistent escaping and cache semantics across endpoints.
  - Feed layout exposes both feeds via `<link rel="alternate" type="application/rss+xml" ...>` and Next.js `metadata.alternates` so readers and crawlers can discover them.
- **Inbound RSS config (default sources)**
  - **Why**: "Where do we put RSS feed URLs?" should have one answer; runtime enable/disable should stay in the DB so we can turn feeds off without a deploy.
  - Default list moved from `game-bootstrap-service.ts` to `packages/engine/src/config/rss-sources.ts` as `DEFAULT_RSS_SOURCES`. Bootstrap seeds `rssFeedSources` from it; engine continues to read only from DB. Add or edit default feed URLs in that config file.

- **Public API tiered rate limiting**
  - **Why**: Public GET endpoints (feeds, markets, profiles, etc.) were previously unrate-limited. That allowed unbounded anonymous traffic, increasing cost and abuse risk. We now apply tiered limits so anonymous callers are capped per IP while authenticated users and API keys get higher quotas.
  - New configs in `@babylon/api` rate limiting:
    - **Read endpoints**: 20 req/min per IP (unauthenticated), 60 req/min per user (authenticated or API key), 10 req/min shared when IP cannot be determined.
    - **Firehose (SSE)**: 5 connections/min per IP (unauthenticated), 20/min per user, 2/min shared when IP unknown.
  - New helper `publicRateLimit(request, kind?)` in `@babylon/api`: runs optional auth, then rate limits by `userId` (if authed) or by client IP (otherwise), or by shared anonymous bucket if IP is missing. Returns `{ error, user, rateLimitInfo }` so handlers can avoid double-auth and attach standard headers on success.
  - New helper `addPublicReadHeaders(response, rateLimitInfo)`: sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Cache-Control: public, s-maxage=5, stale-while-revalidate=10` on successful public read responses. **Why**: Clients can respect limits before hitting 429; CDNs can cache and reduce origin load.
  - All public read-only GET routes (posts, markets, trending, reputation, registry, NFT, NPC, stats, SSE stats, onboarding check-username, questions dynamics, etc.) now call `publicRateLimit()` at the top and attach rate limit + cache headers on success. Auth-only routes (e.g. user search) still use `authenticate()` but apply `publicRateLimit()` first so unauthenticated attempts are rate limited by IP before returning 401.
  - **Null-user safety**: Endpoints that allow unauthenticated access were audited so that `user` is never dereferenced without a null check and query parameters (e.g. `userId`, `following`) are not trusted for authorization—only the authenticated identity from the token/API key is used for user-scoped data.
- **Public firehose token**
  - **GET /api/realtime/public-token**: Issues a short-lived token scoped only to public SSE channels (`feed`, `markets`, `breaking-news`, `upcoming-events`). No authentication required. **Why**: Enables read-only clients (dashboards, embeds) to subscribe to the public firehose without logging in, while keeping DMs and notifications behind the authenticated token endpoint. Rate limited with the firehose tier (5/min per IP) to prevent abuse of token issuance.

### Changed

- **GET /api/posts**: Enters the “following” feed branch only when the authenticated user matches the query `userId`; block/mute filters use `authUser?.userId` from auth, not from query params, so unauthenticated callers cannot leak or guess other users’ moderation state.
- **GET /api/registry** and **GET /api/registry/all**: Use `publicRateLimit()` instead of `optionalAuth()` alone; successful responses include rate limit and cache headers.
- **GET /api/onboarding/check-username**: Same pattern—`publicRateLimit()` supplies optional auth and rate limit info; headers attached on success.

### Developer notes

- When adding new public GET endpoints, call `publicRateLimit(request)` (or `publicRateLimit(request, 'firehose')` for SSE/token endpoints) at the start of the handler and use the returned `user` instead of calling `optionalAuth()` again. Always guard on `user` being null and call `addPublicReadHeaders(res, rateLimitInfo)` on successful responses when `rateLimitInfo` is present. See `packages/api/src/rate-limiting/README.md` for full usage and rationale.
