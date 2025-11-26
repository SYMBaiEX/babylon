#!/bin/bash
set -e

# Database setup script for CI environments
# This script ensures database is properly initialized with Drizzle schema

echo "🔧 Setting up test database..."

# Export database URLs
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/test_db}"
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

echo "📊 Database URL: ${DATABASE_URL}"

# Check PostgreSQL version and configuration
echo "🔍 Checking PostgreSQL version and settings..."
psql "$DATABASE_URL" -c "SELECT version();"
psql "$DATABASE_URL" -c "SHOW max_locks_per_transaction;"
psql "$DATABASE_URL" -c "SHOW shared_buffers;"
psql "$DATABASE_URL" -c "SHOW max_connections;"

# Use drizzle-kit push to sync schema
echo "🗄️ Pushing database schema with Drizzle..."
bunx drizzle-kit push --force || {
  echo "❌ Schema push failed"
  exit 1
}

# Verify critical tables exist
echo "🔍 Verifying database tables..."
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'posts', 'comments', 'actors', 'pools', 'questions') ORDER BY tablename;"

# List ALL tables to debug what's being created
echo "📋 Listing all tables created:"
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"

# Count tables to ensure migration succeeded
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';" | tr -d ' ')
TABLE_COUNT=${TABLE_COUNT:-0}
echo "✅ Found $TABLE_COUNT tables in database"

if [ "$TABLE_COUNT" -lt "15" ]; then
  echo "❌ ERROR: Expected at least 15 tables but found only $TABLE_COUNT"
  echo "Schema push may have failed."

  # Check specifically for critical tables
  echo "Checking for critical tables..."
  for table in users posts comments actors pools questions markets positions; do
    EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = '$table';" | tr -d ' ')
    if [ "$EXISTS" -eq "0" ]; then
      echo "❌ CRITICAL: $table table does not exist!"
    else
      echo "✓ $table table exists"
    fi
  done

  # Don't exit if we have core tables
  CORE_TABLES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'posts', 'comments');" | tr -d ' ')
  if [ "$CORE_TABLES" -lt "3" ]; then
    echo "❌ FATAL: Core tables (users, posts, comments) are missing. Cannot continue."
    exit 1
  fi
  echo "⚠️  WARNING: Not all tables created, but core tables exist. Continuing..."
else
  echo "✅ Found $TABLE_COUNT tables in database"
fi

# Run seed if not skipped
if [ "$SKIP_SEED" != "true" ]; then
  echo "🌱 Seeding database..."
  bun run db:seed
fi

echo "✅ Database setup complete!"
