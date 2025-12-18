#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required"
  exit 1
fi

# Drizzle config prefers DIRECT_DATABASE_URL in CI/non-local modes.
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

echo "🧹 Resetting public schema..."
bun - <<'EOF'
import postgres from 'postgres';

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Missing DATABASE_URL');

const sql = postgres(url, { max: 1 });

const schemas = await sql<Array<{ schemaName: string }>>`
  select schema_name as "schemaName"
  from information_schema.schemata
  where schema_name not like 'pg_%'
    and schema_name <> 'information_schema'
`;

for (const { schemaName } of schemas) {
  const quoted = `"${schemaName.replaceAll('"', '""')}"`;
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoted} CASCADE;`);
}

await sql.unsafe('CREATE SCHEMA IF NOT EXISTS public;');

const info = await sql<
  Array<{ db: string; port: number; searchPath: string }>
>`select current_database() as db, inet_server_port() as port, current_setting('search_path') as "searchPath"`;
console.log('[db-reset] connected', info[0]);

const userApiKey = await sql<
  Array<{ schema: string }>
>`select table_schema as schema from information_schema.tables where table_name = 'UserApiKey'`;
if (userApiKey.length > 0) {
  console.error('[db-reset] unexpected leftover table UserApiKey', userApiKey);
  process.exit(1);
}

await sql.end({ timeout: 5 });
EOF

echo "🗄️  Applying database migrations..."
PGOPTIONS="--search_path=public" bun run db:migrate
echo "✅ Database migrations applied"
