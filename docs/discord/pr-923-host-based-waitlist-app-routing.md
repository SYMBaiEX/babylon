# PR 923 — Soft launch routing (waitlist + token-gated app)

PR: https://github.com/BabylonSocial/babylon/pull/923

## TL;DR
- `babylon.market` / `staging.babylon.market` = waitlist
- `app.babylon.market` / `app.staging.babylon.market` = app (token-gated)
- App access during soft launch: **NFT holder OR Top-100 claimable (snapshot)**; everyone else stays on waitlist

## Changes
- Host-based routing (no more global `WAITLIST_MODE` switch).
- Gating updated: claimable users are treated as allowed (not only minted/holders).
- Referrals always land on the waitlist canonical URL (even if shared from `app.*`).

## Vercel config needed
- Domains: `babylon.market`, `www.babylon.market`, `app.babylon.market`, `staging.babylon.market`, `app.staging.babylon.market`
- Env vars:
  - `NEXT_PUBLIC_WAITLIST_URL` (prod/staging)
  - `NEXT_PUBLIC_APP_URL` (prod/staging)
  - `WAITLIST_HOSTNAMES` (CSV)
  - `NFT_GATING_ENABLED=true`

## Quick QA
1. `https://staging.babylon.market/` shows waitlist
2. `https://staging.babylon.market/nft` redirects to `https://app.staging.babylon.market/nft`
3. `https://app.staging.babylon.market/feed`:
   - logged out → redirect waitlist
   - logged in, not claimable/holder → redirect waitlist
   - logged in, claimable/holder → access OK
