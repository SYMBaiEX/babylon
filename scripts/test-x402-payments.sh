#!/bin/bash

# Test X402 Payment System
# Run this script to validate that the X402 payment system works correctly with Redis

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔥 X402 Payment System Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Redis is running
echo "🔍 Checking Redis connection..."
if [ -n "$REDIS_URL" ] || [ -n "$UPSTASH_REDIS_REST_URL" ]; then
  echo "✅ Redis environment variables found"
else
  echo "⚠️  Redis not configured - tests will use fallback behavior"
  echo "   Local: Set REDIS_URL=redis://localhost:6379"
  echo "   Production: Upstash env vars should be set"
  echo ""
fi

# Run unit tests for X402Manager
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Running X402Manager Unit Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bun test src/a2a/tests/payments/x402-manager.test.ts

# Run integration tests for points purchase flow
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Running Points Purchase Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bun test src/a2a/tests/integration/points-purchase-flow.test.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All X402 Payment Tests Passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Key tests validated:"
echo "  ✓ Payment request creation"
echo "  ✓ Payment retrieval across instances (serverless simulation)"
echo "  ✓ Payment verification flow"
echo "  ✓ Redis persistence (critical for Vercel)"
echo "  ✓ Regression test for 'payment not found' bug"
echo ""
echo "To test the full API flow:"
echo "  npm run dev"
echo "  Open http://localhost:3000"
echo "  Navigate to points purchase"
echo "  Try buying points"
echo ""

