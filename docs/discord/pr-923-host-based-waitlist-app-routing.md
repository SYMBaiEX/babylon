# PR 923 — Host-based waitlist + token-gated app routing

PR: https://github.com/BabylonSocial/babylon/pull/923

## Why
- We want a real production deployment while keeping the waitlist live for soft launch.
- Users who are **Top 100 claimable** (snapshot) or **already hold** should access the app (claim + usage).
- Everyone else should remain on the waitlist.

## What changed (high-level)
- **Waitlist vs App is now determined by hostname** (single Vercel/Next project):
  - Waitlist hosts: `babylon.market`, `www.babylon.market`, `staging.babylon.market` (configurable)
  - App hosts: everything else (ex: `app.babylon.market`, `app.staging.babylon.market`)
- Removed the global “either waitlist or app” behavior driven by `WAITLIST_MODE` (deprecated).
- NFT gating now allows access for:
  - **holders** (on-chain via indexer, with fallback), OR
  - **claimable users** (Top 100 snapshot presence), OR
  - **admins** (bypass)
- Referrals now always point to the **waitlist canonical URL** (even when shared from the app domain).

## User-facing behavior
- `staging.babylon.market/` → waitlist (as requested).
- `staging.babylon.market/nft` → redirects to `app.staging.babylon.market/nft` (claim flow stays on app domain).
- `app.*` (when `NFT_GATING_ENABLED=true`):
  - non-authenticated → redirect to waitlist
  - authenticated but not holder/claimable → redirect to waitlist
  - authenticated and holder/claimable → allowed into the app

## Ops / Config (Vercel)
### Domains (same Vercel project)
- Waitlist prod: `babylon.market`, `www.babylon.market`
- App prod: `app.babylon.market`
- Waitlist staging: `staging.babylon.market`
- App staging: `app.staging.babylon.market`

### Env vars (Production)
- `NEXT_PUBLIC_WAITLIST_URL=https://babylon.market`
- `NEXT_PUBLIC_APP_URL=https://app.babylon.market`
- `WAITLIST_HOSTNAMES=babylon.market,www.babylon.market`
- `NFT_GATING_ENABLED=true`

### Env vars (Staging)
- `NEXT_PUBLIC_WAITLIST_URL=https://staging.babylon.market`
- `NEXT_PUBLIC_APP_URL=https://app.staging.babylon.market`
- `WAITLIST_HOSTNAMES=staging.babylon.market`
- `NFT_GATING_ENABLED=true`

## Testing / Checks
- `bun run typecheck`
- `bun run lint`
- `bun run build` (ran via pre-push hook)
- Targeted test: `bun test packages/api/src/__tests__/auth-middleware.test.ts`

## Risks / Notes
- This changes routing/auth boundaries; review cookie behavior across `babylon.market` ↔ `app.babylon.market` (Privy cookie domain config may matter).
- Host-based routing is configurable via `WAITLIST_HOSTNAMES`; make sure env vars are set before verifying.

## Quick QA checklist
1. Open waitlist:
   - `https://staging.babylon.market/` shows waitlist
2. NFT path on waitlist host:
   - `https://staging.babylon.market/nft` redirects to `https://app.staging.babylon.market/nft`
3. App gating:
   - `https://app.staging.babylon.market/feed`:
     - logged out → redirects to waitlist
     - logged in but not claimable/holder → redirects to waitlist
     - logged in and claimable/holder → can access feed

