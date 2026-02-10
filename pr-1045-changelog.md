**PR:** https://github.com/BabylonSocial/babylon/pull/1045

### NFT Mint Error Sanitization + Debug Reference
- Stop leaking raw internal mint errors to the user (ex: Privy `Invalid JWT token provided`, HTTP payloads, stacks).
- Return a stable `errorId` + mint `step` so support can correlate user reports with server logs.
- Redact JWT-like tokens from error messages/stacks before logging to reduce risk of credential leakage.
- UI surfaces user-safe messaging and includes `Ref: <errorId>` for faster triage.
