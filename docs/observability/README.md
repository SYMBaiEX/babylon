# Observability

Client and server instrumentation for operating Feed in production.

| Doc | What it covers |
|-----|----------------|
| [Speed Insights (Vercel RUM)](./speed-insights.md) | Historical Vercel setup; removed from the Cloudflare application |

Related: error tracking and performance traces live in Sentry (see `.env.example`); product analytics in PostHog.

Cloudflare deployment logs are enabled in Wrangler. PostHog remains active when configured. Sentry is disabled during migration until Worker compatibility is verified.
