# Sentry Observability Contract

This document defines Babylon's baseline Sentry contract for web/API/server-action/worker surfaces.

## Scope covered

- Next.js App Router API route exports (`GET`, `POST`, etc.) wrapped with `withErrorHandling` from `@babylon/api`
- Next.js server actions wrapped with `wrapServerActionWithSentry`
- App error boundaries, including `PanelErrorBoundary`
- Babylon CLI runtime (Bun) via `@sentry/bun`
- Envio indexer runtime (Node.js) via `@sentry/node`

## Tagging contract

All captured events should include:

- `runtime`: runtime origin (`nodejs`, etc.)
- `surface`: logical surface (`api-route`, `server-action`, `agent-team-panel`, `cli`, `indexer`)
- Surface-specific tag:
  - API routes: `endpoint`, `method`, optional `requestId`
  - Server actions: `action`
  - CLI: `cli.domain`, `cli.command`

## Context contract

- API route captures include sanitized request/user context from `errorHandler`.
- Server action captures include sanitized argument metadata only (shape/size-oriented).
- Sensitive keys are redacted (`token`, `secret`, `password`, `authorization`, `cookie`, `jwt`, `api-key`, `signature`).

## Capture policy

By default, `errorHandler` does **not** capture expected client-path errors:

- auth failures
- Zod validation errors
- operational 4xx Babylon errors

Unexpected server errors are captured.

## Known gaps / follow-up

- Any new API route handler exports must remain wrapped; `packages/testing/unit/web/api-routes-with-error-handling.test.ts` enforces this.
