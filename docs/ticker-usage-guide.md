# How to Place and Use the Babylon Ticker

This guide shows where and how to use the Babylon ticker: websites, livestreaming software (OBS), and other places that support iframes or browser sources. Replace `https://babylon.market` with your deployment URL (e.g. staging or localhost) when needed.

---

## Base URL and parameters

**Base URL:** `https://babylon.market/ticker`

**Useful query parameters:**

| Param     | Example   | Effect |
|----------|-----------|--------|
| `streams` | `news,perps` | Show only news and perps (omit predictions). |
| `theme`  | `light` or `dark` | Background and text color. |
| `speed`  | `0.5` to `2` | Scroll speed (1 = default; higher = faster). |
| `height` | `48` (32–120) | Bar height in pixels. |

Examples:

- All streams, dark, default size:  
  `https://babylon.market/ticker`
- Light theme, 56px tall:  
  `https://babylon.market/ticker?theme=light&height=56`
- Only perps and news, faster scroll:  
  `https://babylon.market/ticker?streams=perps,news&speed=1.5`

---

## 1. Website (iframe)

Place the ticker in any page that allows iframes. Set `width` and `height` to match your layout; the ticker fills the iframe.

### Full-width bar at the top

```html
<iframe
  src="https://babylon.market/ticker?theme=dark&speed=1&height=48"
  width="100%"
  height="48"
  frameborder="0"
  title="Babylon Ticker"
  style="display: block;"
></iframe>
```

### Full-width bar at the bottom

Same as above; put the iframe in a fixed or sticky footer:

```html
<footer style="position: sticky; bottom: 0; left: 0; right: 0;">
  <iframe
    src="https://babylon.market/ticker?theme=light&height=40&speed=1"
    width="100%"
    height="40"
    frameborder="0"
    title="Babylon Ticker"
  ></iframe>
</footer>
```

### Sidebar or narrow column

Use a fixed pixel width or a percentage. The ticker content scrolls horizontally, so a narrow width still works:

```html
<aside style="width: 320px;">
  <iframe
    src="https://babylon.market/ticker?theme=dark&height=120&speed=0.8"
    width="100%"
    height="120"
    frameborder="0"
    title="Babylon Ticker"
  ></iframe>
</aside>
```

### Only predictions and news (no perps)

```html
<iframe
  src="https://babylon.market/ticker?streams=predictions,news&theme=dark&height=48"
  width="100%"
  height="48"
  frameborder="0"
  title="Babylon Ticker"
></iframe>
```

---

## 2. OBS (Open Broadcaster Software) / livestreaming

Use a **Browser** source so the ticker appears as an overlay in your stream.

### Steps (OBS Studio)

1. Add a source: **+** → **Browser**.
2. Name it (e.g. “Babylon Ticker”).
3. Set **URL** to the ticker page with the params you want, for example:
   ```
   https://babylon.market/ticker?theme=dark&speed=1&height=48
   ```
4. Set **Width** and **Height** to match your scene (e.g. 1920×48 for a full-width bar).
5. Position the source at the top or bottom of the scene.

### Example URLs for OBS

- **Bottom bar, dark (common for streams):**  
  `https://babylon.market/ticker?theme=dark&height=48&speed=1`
- **Top bar, light (for light overlays):**  
  `https://babylon.market/ticker?theme=light&height=56&speed=1.2`
- **Only perps (markets only):**  
  `https://babylon.market/ticker?streams=perps&theme=dark&height=40`
- **Slower scroll (easier to read):**  
  `https://babylon.market/ticker?speed=0.6&height=48`

### Tips for OBS

- Use the same aspect ratio as your canvas (e.g. 1920×48) so the ticker doesn’t stretch.
- If the ticker doesn’t update, refresh the browser source (right‑click → **Refresh**).
- For a transparent background, the ticker page uses a solid background (`dark` or `light`); for transparency you’d need a custom build or a different overlay approach.

---

## 3. Other embed-friendly platforms

Any place that supports **iframes** or **embed URLs** can show the ticker. Use the same base URL and params as above.

### Notion

1. Add a block: **/embed** or **Embed**.
2. Paste the ticker URL, e.g.:  
   `https://babylon.market/ticker?theme=light&height=48`
3. Resize the embed block to the height you want.

### Discord

Discord does not support live iframes in messages. To share the ticker:

- Post the **link** so viewers can open it in a browser:  
  `https://babylon.market/ticker?theme=dark&height=48`
- Or embed the ticker in a **webhook or bot** that sends a static snapshot; the live scrolling experience requires opening the URL in a browser or an embedded browser elsewhere.

### Farcaster / other apps

If the app allows embedding a URL in a browser view or iframe, use the same ticker URL with the desired `theme`, `height`, `speed`, and `streams` params.

---

## 4. Using the data API (custom UI)

If you want to build your own ticker or overlay (e.g. custom styling or layout), use the **ticker API** and render the data yourself.

**Endpoint:** `GET https://babylon.market/api/ticker`

**Example: fetch and log**

```js
const params = new URLSearchParams({
  streams: 'news,predictions,perps',
  limit: '20',
});
const res = await fetch(`https://babylon.market/api/ticker?${params}`);
const data = await res.json();
// data.news, data.predictions, data.perps
console.log(data);
```

**Example: HTML + vanilla JS (simple list)**

```html
<div id="ticker"></div>
<script>
  (async function () {
    const res = await fetch('https://babylon.market/api/ticker?limit=15');
    const data = await res.json();
    const items = [
      ...(data.news || []).map((n) => ({ label: 'News', text: n.title })),
      ...(data.predictions || []).map((p) => ({ label: 'Prediction', text: `${p.question} · Yes ${p.yesPercent}%` })),
      ...(data.perps || []).map((p) => ({ label: 'Perp', text: `${p.ticker} $${p.price.toFixed(2)} (${p.changePercent24h >= 0 ? '+' : ''}${p.changePercent24h.toFixed(2)}%)` })),
    ];
    document.getElementById('ticker').innerHTML = items
      .map((i) => `<span><strong>${i.label}</strong> ${i.text}</span>`)
      .join(' · ');
  })();
</script>
```

Use the same URL on your own domain or in a custom OBS overlay; the API is public and does not require authentication.

---

## Quick reference: copy-paste URLs

| Use case              | URL |
|-----------------------|-----|
| Default (all streams, dark) | `https://babylon.market/ticker` |
| Light theme           | `https://babylon.market/ticker?theme=light` |
| Taller bar (56px)      | `https://babylon.market/ticker?height=56` |
| Only perps             | `https://babylon.market/ticker?streams=perps` |
| Only news + predictions | `https://babylon.market/ticker?streams=news,predictions` |
| Slower scroll          | `https://babylon.market/ticker?speed=0.6` |
| Faster scroll          | `https://babylon.market/ticker?speed=1.5` |

For full API and embed details, see [Ticker Embed and API](../apps/docs/content/reference/ticker-embed.md).
