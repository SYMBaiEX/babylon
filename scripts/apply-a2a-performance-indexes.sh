#!/bin/bash
#
# Apply A2A Performance Indexes
# 
# This script applies database indexes to optimize A2A endpoint performance
#

set -e

echo "═══════════════════════════════════════════════════════"
echo "  A2A Performance Optimization - Apply Indexes"
echo "═══════════════════════════════════════════════════════"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo ""
  echo "Please set DATABASE_URL to your PostgreSQL connection string:"
  echo "export DATABASE_URL='postgresql://user:password@host:port/database'"
  echo ""
  exit 1
fi

echo "📋 Database Configuration:"
echo "   URL: ${DATABASE_URL%%@*}@***" # Hide credentials
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
  echo "❌ ERROR: psql command not found"
  echo ""
  echo "Please install PostgreSQL client tools:"
  echo "  macOS: brew install postgresql"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  echo ""
  exit 1
fi

echo "🔍 Testing database connection..."
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo "❌ ERROR: Cannot connect to database"
  echo ""
  echo "Please check your DATABASE_URL and ensure the database is running"
  echo ""
  exit 1
fi

echo "✅ Database connection successful"
echo ""

# Count existing indexes
echo "📊 Checking existing indexes..."
EXISTING_INDEXES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) 
  FROM pg_indexes 
  WHERE indexname LIKE 'idx_%'
" 2>/dev/null | tr -d ' ')

echo "   Current custom indexes: $EXISTING_INDEXES"
echo ""

# Confirm before applying
echo "⚠️  This will create 35+ new indexes to optimize A2A queries"
echo ""
read -p "Do you want to continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Aborted"
  exit 1
fi

echo ""
echo "🚀 Applying indexes..."
echo ""

# Apply the indexes
if psql "$DATABASE_URL" < drizzle/migrations/add_a2a_performance_indexes.sql; then
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "✅ SUCCESS - Indexes applied successfully!"
  echo "═══════════════════════════════════════════════════════"
  echo ""
  
  # Count new indexes
  NEW_INDEXES=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*) 
    FROM pg_indexes 
    WHERE indexname LIKE 'idx_%'
  " 2>/dev/null | tr -d ' ')
  
  ADDED_INDEXES=$((NEW_INDEXES - EXISTING_INDEXES))
  
  echo "📊 Index Summary:"
  echo "   Before: $EXISTING_INDEXES indexes"
  echo "   After:  $NEW_INDEXES indexes"
  echo "   Added:  $ADDED_INDEXES new indexes"
  echo ""
  
  echo "📈 Expected Performance Improvements:"
  echo "   • getPositions:    50-80% faster"
  echo "   • getFeed:         70-90% faster"
  echo "   • getLeaderboard:  80-90% faster"
  echo "   • getTradeHistory: 60-80% faster"
  echo "   • Overall P95:     50-70% reduction"
  echo ""
  
  echo "🧪 Next Steps:"
  echo "   1. Run stress test to verify improvements:"
  echo "      bun run stress-test:a2a:heavy"
  echo ""
  echo "   2. Compare before/after metrics"
  echo ""
  echo "   3. Monitor production performance"
  echo ""
  
  echo "✨ Optimization complete!"
  echo ""
else
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "❌ ERROR - Failed to apply indexes"
  echo "═══════════════════════════════════════════════════════"
  echo ""
  echo "Check the error messages above for details"
  echo ""
  exit 1
fi

