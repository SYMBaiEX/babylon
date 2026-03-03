# Sentry Observability Contract

This document defines Babylon's baseline Sentry contract for web/API/server-action surfaces.

## Scope covered

- Next.js API routes that use `withErrorHandling` from `@babylon/api`
- Next.js server actions wrapped with `wrapServerActionWithSentry`
- App error boundaries, including `PanelErrorBoundary`

## Tagging contract

All captured events should include:

- `runtime`: runtime origin (`nodejs`, etc.)
- `surface`: logical surface (`api-route`, `server-action`, `agent-team-panel`)
- Surface-specific tag:
  - API routes: `endpoint`, `method`, optional `requestId`
  - Server actions: `action`

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

- Some API endpoints do not use `withErrorHandling` yet and need dedicated migration.
- CLI and indexer runtime instrumentation should be tracked as follow-up slices.
