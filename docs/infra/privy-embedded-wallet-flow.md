# Privy embedded wallets + server-side transactions (Babylon)

This repo is being refactored away from Privy **smart wallets** (AA) to a simpler model:

- Users get a Privy **embedded EVM wallet** (EOA) on login.
- All onchain transactions are triggered from the server (Next server actions / API routes) using
  Privy's **server-side user wallet** flow.
- Gas fees are sponsored via Privy **native gas sponsorship** (`sponsor: true`).

This doc is a step-by-step checklist for the required Privy setup.

## 1) Privy Dashboard setup

### 1.1 Enable embedded wallet creation

- In Privy Dashboard, ensure embedded Ethereum wallets are enabled.
- We rely on `embeddedWallets.ethereum.createOnLogin = "users-without-wallets"` in
  `packages/shared/src/auth/privy-config.ts`.

### 1.2 Enable gas sponsorship (native)

- Go to the Gas Sponsorship dashboard page and enable it for the app.
- Enable the required chains:
  - Production: **Ethereum Mainnet** (`eip155:1`)
  - Staging/test: whatever chain IDs your `.env.*` selects
- If the dashboard offers a toggle to allow client-side sponsored transactions:
  - Prefer disabling it. Babylon sponsors **from the server**.

## 2) Environment variables (local/staging/prod)

Required (already in `.env.example`):

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`

Notes:

- `NEXT_PUBLIC_PRIVY_APP_ID` is safe to expose to the client.
- `PRIVY_APP_SECRET` is server-only and must never be exposed to the client.

## 2.1) Database schema note (required for this refactor)

This flow stores the embedded wallet **resource id** in the DB so server-side actions can submit
transactions on behalf of the authenticated user.

- New column: `User.privyWalletId` (text)

If you pulled this refactor onto an existing database (local/staging), make sure your DB schema is
up to date before testing login/onboarding:

- Recommended: `bun --env-file=.env.staging.local run db:push` (or the equivalent env file)
- Minimal manual fix (Postgres): add the column `privyWalletId` to the `"User"` table

## 3) How server-side wallet actions work (mental model)

Babylon sends transactions from the server by:

1) Reading the user's Privy auth token (cookie `privy-token`).
2) Resolving the user's **embedded wallet** `{walletId, address}` from the Privy user object.
3) Calling the Privy Node SDK:
   - `privy.wallets().ethereum().sendTransaction(walletId, { sponsor: true, ... , authorization_context: { user_jwts: [token] } })`

This keeps UX seamless (no signature modal) while still cryptographically binding the request to the
authenticated user.

## 4) Optional: offline actions (no active user session)

For truly offline actions (limit orders, agentic trades, etc.), Privy requires configuring **signers**
and applying restrictive **policies**.

Babylon does not enable this by default in code. If/when you add it:

- Create a key quorum in Privy Dashboard.
- Create policies restricting allowed contract interactions.
- Add the signer to user wallets (requires user consent) and store signer/policy IDs.
- Send server-side requests with `authorization_context.authorization_private_keys`.

## 5) Operational checklist

- [ ] Verify login creates an embedded wallet for a fresh user.
- [ ] Verify server can send a sponsored transaction with `sponsor: true` on your target chain.
- [ ] Verify the user's onchain address in Babylon is the embedded wallet address (EOA).
- [ ] Verify no code path depends on Privy smart wallets (AA/bundler/paymaster).
