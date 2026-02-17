# RSS Feeds

Documentation for RSS in Babylon: **outbound** (we publish feeds others can subscribe to) and **inbound** (we consume external feeds for news/parody).

---

## Outbound RSS (publishing)

We expose two RSS 2.0 feeds so users and tools can subscribe to Babylon content in standard readers.

| Feed | URL | Content |
|------|-----|--------|
| **Babylon Feed** | `GET /feed/rss` | Hot posts (same as main feed, last 50 by engagement). |
| **Babylon Breaking News** | `GET /feed/breaking-news/rss` | World events, org price updates, actor posts (same as the breaking-news widget, last 20). |

### Why two feeds?

- **“What people said”** (posts) vs **“what happened”** (events/news) are different use cases. One feed for discussion, one for live updates.
- Both reuse existing JSON APIs internally so we don’t duplicate filtering, scoring, or RLS.

### How it works

- Each RSS route **calls the corresponding JSON API** (`/api/feed/hot`, `/api/feed/widgets/breaking-news`) and converts the response to RSS 2.0 XML.
- **Why internal fetch:** All business logic (engagement scoring, time filters, RLS) stays in the API; the RSS route is a thin “JSON → XML” layer. Caching (e.g. hot feed 60s) is reused.
- A **shared builder** in `apps/web/src/lib/rss.ts` produces the XML (escaping, RFC 1123 dates, `atom:link` self). **Why one helper:** Consistent behavior and cache headers across both endpoints.
- **Cache:** RSS responses use `Cache-Control: public, max-age=300` (5 min). **Why:** Readers typically poll every 30 min–2 hr; 5 min balances freshness with load.

### Discovery

- Feed layout (`apps/web/src/app/feed/layout.tsx`) adds:
  - `metadata.alternates.types['application/rss+xml'] = '/feed/rss'` (Next.js canonical).
  - Two `<link rel="alternate" type="application/rss+xml" ...>` tags (Babylon Feed and Babylon Breaking News). **Why both:** Next metadata allows only one URL per MIME type; the extra links make the second feed discoverable.

### Item links

- **Posts:** `<link>` is `{origin}/post/{id}` so subscribers open the post in Babylon.
- **Breaking news:** Items that are posts use `/post/{id}`; world events (no post id) use `/feed`. **Why:** Subscribers get a direct link when we have one; otherwise the feed page.

### Code locations

| What | Where |
|------|--------|
| RSS XML builder + cache headers | `apps/web/src/lib/rss.ts` |
| GET /feed/rss | `apps/web/src/app/feed/rss/route.ts` |
| GET /feed/breaking-news/rss | `apps/web/src/app/feed/breaking-news/rss/route.ts` |
| Discovery links | `apps/web/src/app/feed/layout.tsx` |

---

## Inbound RSS (sources we consume)

The engine **fetches external RSS feeds**, stores headlines in `rssHeadlines`, and uses them for parody generation and world facts. The list of **default feed URLs** lives in one config file; the **runtime** list is in the DB.

### Why config + DB?

- **Single place to add/edit default URLs:** `packages/engine/src/config/rss-sources.ts`. No need to open the bootstrap service.
- **Runtime control in DB:** `rssFeedSources.isActive` and error counts live in the DB so we can disable or tune sources without a deploy.
- **Engine reads only from DB:** Fetch and tick logic use `rssFeedSources`; they don’t import the config. Bootstrap seeds the DB from config on startup.

### Default sources

Defined in `packages/engine/src/config/rss-sources.ts` as `DEFAULT_RSS_SOURCES` (name, feedUrl, category). Categories include `tech`, `business`, `crypto`. Bootstrap ensures each URL exists in `rssFeedSources` (insert if missing by `feedUrl`).

### Code locations

| What | Where |
|------|--------|
| Default feed list + type | `packages/engine/src/config/rss-sources.ts` |
| Config export | `packages/engine/src/config/index.ts` |
| Seeding into DB | `packages/engine/src/services/game-bootstrap-service.ts` (`ensureRSSFeeds`) |
| Fetch/store/parody pipeline | `packages/engine/src/services/rss-feed-service.ts`, game tick, cron `world-facts` |

### Adding or changing inbound sources

1. **Default list:** Edit `DEFAULT_RSS_SOURCES` in `packages/engine/src/config/rss-sources.ts`. New entries are seeded on next bootstrap.
2. **Runtime:** Today, enable/disable is via DB (`isActive`). A future admin API could CRUD `rssFeedSources` without a deploy.

---

## Summary

| Direction | Purpose | Where URLs / content come from |
|----------|---------|--------------------------------|
| **Outbound** | Publish feeds for subscribers | Content from our own APIs; URLs under `/feed/rss` and `/feed/breaking-news/rss`. |
| **Inbound** | Consume external news for parodies/facts | Default URLs in `rss-sources.ts`; runtime list in DB (`rssFeedSources`). |

All design choices (single RSS builder, internal fetch for outbound, config file for default inbound) are to keep **one source of truth** and avoid duplicating logic.
