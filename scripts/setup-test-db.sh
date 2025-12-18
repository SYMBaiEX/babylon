#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required"
  exit 1
fi

# Drizzle config prefers DIRECT_DATABASE_URL in CI/non-local modes.
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

echo "🧹 Resetting public schema..."
bun -e '
import postgres from "postgres";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Missing DATABASE_URL");

const sql = postgres(url, { max: 1 });
await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE;");
await sql.unsafe("CREATE SCHEMA public;");
await sql.end({ timeout: 5 });
'

echo "🗄️  Applying database migrations..."
bun run db:migrate
echo "✅ Database migrations applied"
