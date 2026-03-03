# Sentry Observability Contract

This document defines Babylon's baseline Sentry contract for web/API/server-action/edge/CLI surfaces in the monorepo.

## Scope covered

- Next.js App Router API route exports (`GET`, `POST`, etc.) wrapped with `withErrorHandling` from `@babylon/api`
- Next.js server actions wrapped with `wrapServerActionWithSentry`
- App error boundaries, including `PanelErrorBoundary` and `PostHogErrorBoundary`
- Next.js server and edge runtime initialization (`sentry.server.config.ts`, `sentry.edge.config.ts`)
- Babylon CLI runtime (Bun) via `@sentry/bun`

## Tagging contract

All captured events should include:

- `runtime`: runtime origin (`nodejs`, `edge`, etc.)
- `surface`: logical surface (`api-route`, `server-action`, `agent-team-panel`, `cli`)
- Surface-specific tags:
  - API routes: `endpoint`, `method`, optional `requestId`
  - Server actions: `action`
  - CLI: `cli.domain`, `cli.command`

## Context contract

- API route captures include sanitized request/user context from `errorHandler`.
- Server action captures include sanitized argument metadata only (shape/size-oriented).
- Sensitive keys are redacted (`token`, `secret`, `password`, `authorization`, `cookie`, `jwt`, `api-key`, `signature`, `session`, `credential`, `wallet`, `private-key`).

## Capture policy

By default, `errorHandler` does **not** capture expected client-path errors:

- auth failures
- Zod validation errors
- operational 4xx Babylon errors

Unexpected server errors are captured.

## Required environment variables

- Runtime:
  - `SENTRY_DSN` (server/edge/CLI) and/or `NEXT_PUBLIC_SENTRY_DSN` (browser)
  - Recommended: `SENTRY_ENVIRONMENT` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (to separate staging/production data)
- Build (source maps/releases):
  - `SENTRY_AUTH_TOKEN` (CI/Vercel only)
  - `SENTRY_ORG`, `SENTRY_PROJECT`
  - Recommended: `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE`

## Known gaps / follow-up

- Any new API route handler exports must remain wrapped; `packages/testing/unit/web/api-routes-with-error-handling.test.ts` enforces this.
- Indexer runtime instrumentation is tracked separately in the `indexer/` repository.
