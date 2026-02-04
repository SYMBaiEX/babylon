# Changelog — PR #914 (Privy embedded wallets + server-side sponsored tx)

PR: https://github.com/BabylonSocial/babylon/pull/914

- Wallet model simplified
  - Removed Privy Smart Wallet (AA) flow and related client hooks/providers
  - Single wallet model: Privy **Embedded Wallet (EOA)** becomes the canonical user wallet

- "Seamless" on-chain UX (no signature modal)
  - On-chain writes are now executed server-side (Next server actions / API routes) using Privy server-side user wallet flow
  - Gas is sponsored via Privy native gas sponsorship (`sponsor: true`) while keeping `msg.sender = user` (so existing contracts/permissions keep working)

- Data model updates
  - Store `users.privyWalletId` alongside `users.walletAddress` (needed for server-side tx submission)
  - `/api/users/me` backfills `privyWalletId` + `walletAddress` if missing for an existing user

- Key flows updated
  - Onboarding / on-chain registration: submit `registerAgent(...)` from the user embedded wallet (sponsored)
  - Betting / on-chain actions: moved to server actions (sponsored)
  - NFT mint/claim: moved to server action flow (prepare → send tx → confirm)

- Ops / notes
  - Sponsorship covers **gas only**; ETH value transfers still require wallet funding
  - Ensure Privy dashboard gas sponsorship is enabled for the target chains (see `docs/infra/privy-embedded-wallet-flow.md`)

