#!/bin/bash
set -e

# Script to run tests locally with proper database setup
# This mimics the CI environment for consistent test results

echo "🧪 Setting up local test environment..."

# Check if DATABASE_URL is set, if not use default test database
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/test_db}"
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export NODE_ENV=test

echo "📊 Database URL: ${DATABASE_URL}"

# Check if database is accessible
echo "🔍 Checking database connection..."
if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "❌ Cannot connect to database at ${DATABASE_URL}"
  echo ""
  echo "Please ensure PostgreSQL is running. Options:"
  echo "1. Start PostgreSQL locally"
  echo "2. Use Docker: docker run -d --name postgres-test -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine"
  echo "3. Set DATABASE_URL to your existing database"
  exit 1
fi

# Sync database schema with Drizzle
echo "🗄️ Syncing database schema with Drizzle..."
bunx drizzle-kit push --force || {
  echo "❌ Failed to sync database schema"
  exit 1
}

# Verify schema is synced
echo "🔍 Verifying schema..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';" || true

echo "✅ Database setup complete!"
echo ""

# Run the same tests as CI
echo "🧪 Running integration tests (same as CI)..."
echo ""

bun test tests/integration/ tests/deployment/ tests/markets-pnl-sharing.test.ts src/engine/__tests__/

echo ""
echo "✅ Tests complete!"
