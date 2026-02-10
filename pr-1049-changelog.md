**PR:** https://github.com/BabylonSocial/babylon/pull/1049

### NFT Mint: Privy Session Refresh + Safe Token Fallback
- Refresh Privy session (`getAccessToken()`) before triggering the mint server action to avoid missing/expired `privy-token` cookie on first request after a user returns.
- Resolve mint user-context from a token bundle (primary + fallback) and retry once on token-shaped failures.
- Guard fallback by requiring both tokens decode to the same `sub` (prevents cross-user token mixups).
- Adds unit tests for the new token-bundle user-context resolver.

