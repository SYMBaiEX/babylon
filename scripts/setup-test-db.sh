#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required"
  exit 1
fi

# Drizzle config prefers DIRECT_DATABASE_URL in CI/non-local modes.
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

echo "🗄️  Applying database migrations..."
bun run db:migrate
echo "✅ Database migrations applied"

