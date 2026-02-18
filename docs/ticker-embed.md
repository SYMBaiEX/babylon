# Ticker Embed

Embeddable ticker for **news**, **prediction markets**, and **perps** (Polymarket-style). Use the data API and/or the embed page.

## Quick reference

| What | Where |
|------|--------|
| **Data API** | `GET /api/ticker?streams=news,predictions,perps&limit=20` |
| **Embed page** | `/ticker?theme=dark&speed=1&height=48` |
| **Types** | `apps/web/src/types/ticker.ts` |

## API

- **URL:** `GET /api/ticker`
- **Params:** `streams` (comma-separated: `news`, `predictions`, `perps`), `limit` (per-stream, default 20).
- **Response:** JSON with optional `news`, `predictions`, `perps` arrays. Each item has a normalized shape (see reference).
- **Auth:** None. Public, cacheable.

## Embed page

- **URL:** `/ticker`
- **Params:** `streams`, `theme` (light/dark), `speed` (0.5–2), `height` (32–120).
- **Embed:** Use an iframe with the same query params.

Example iframe:

```html
<iframe
  src="https://babylon.market/ticker?theme=light&speed=1&height=48"
  width="100%"
  height="48"
  frameborder="0"
  title="Babylon Ticker"
></iframe>
```

## Usage and placement

See **[How to Place and Use the Babylon Ticker](ticker-usage-guide.md)** for examples in:

- Websites (iframe: top bar, bottom bar, sidebar)
- OBS / livestreaming (browser source)
- Notion, Discord, and custom builds using the API

## Full documentation

See [Ticker Embed and API](../apps/docs/content/reference/ticker-embed.md) in the reference docs for:

- Full API and response shapes
- All embed query parameters
- Implementation notes and related APIs
