# Changelog — PR #895 (Markets terminal UI/UX polish)

PR: https://github.com/BabylonSocial/babylon/pull/895

- Fullscreen
  - Desktop: terminal fullscreen mode
  - Mobile: chart-only fullscreen modal (with header), fullscreen button on chart

- Markets list
  - New Filter + Sort dropdown (matches mock)
  - Favorites filter usable + URL-synced sort/filter

- Bottom panel / tabs
  - Agents + Social tabs restored (Agents default)
  - Social feed: best-effort filter by selected perp (via trending tag), fallback to global feed

- Prediction vs Perps coherence
  - Unified header/time-range (removed duplicate timeframe selector)
  - Prediction title/conditions readable + “Details” modal
  - Consistent YES/NO colors across header/chart/legend/trade toggles
  - Prediction trade panel aligned with perps; YES/NO above BUY/SELL; SELL supported

- Trade panel + balance
  - Trade panel always visible (no collapse)
  - Balance removed from header (no duplication), kept in trade panel
  - Balance formatting consistent (2 decimals)
  - Prediction “avg. price” displayed in $ (not %)

- Mobile layout fixes
  - Removed redundant mobile header; rely on bottom bar
  - Layout fits without page scrolling; only inner lists (Agents/Social/Positions/Trades) scroll
  - Fixed multiple overlap/cut issues (tabs/content vs bottom bar)

