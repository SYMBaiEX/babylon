#!/usr/bin/env bash

set -euo pipefail

# Use DATABASE_URL from environment, fallback to default for local testing
DB_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/test_db}

create_env_files() {
if [[ -f .env.test ]]; then
  echo "ℹ️  Using existing .env.test"
else
  echo "📝 Creating .env.test from environment variables"
  cat > .env.test <<EOF
# Database
DATABASE_URL=${DB_URL}
DIRECT_DATABASE_URL=${DIRECT_DATABASE_URL:-$DB_URL}
POSTGRES_PRISMA_URL=${POSTGRES_PRISMA_URL:-$DB_URL}
POSTGRES_URL_NON_POOLING=${POSTGRES_URL_NON_POOLING:-$DB_URL}
PRISMA_DATABASE_URL=${PRISMA_DATABASE_URL:-$DB_URL}

# Auth
# Make PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_APP_ID interchangeable
PRIVY_APP_ID=${PRIVY_APP_ID:-${NEXT_PUBLIC_PRIVY_APP_ID:-}}
NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID:-${PRIVY_APP_ID:-}}
PRIVY_APP_SECRET=${PRIVY_APP_SECRET:-}
PRIVY_TEST_EMAIL=${PRIVY_TEST_EMAIL:-}
PRIVY_TEST_PHONE=${PRIVY_TEST_PHONE:-}
PRIVY_TEST_OTP=${PRIVY_TEST_OTP:-}
PRIVY_TEST_PASSWORD=${PRIVY_TEST_PASSWORD:-}

# API Keys
WANDB_API_KEY=${WANDB_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
GROQ_API_KEY=${GROQ_API_KEY:-}
FAL_KEY=${FAL_KEY:-}

# Other
CRON_SECRET=${CRON_SECRET:-test-cron-secret}
WALLET_SEED_PHRASE=${WALLET_SEED_PHRASE:-}
WALLET_PASSWORD=${WALLET_PASSWORD:-}

# Redis (if applicable)
${REDIS_URL:+REDIS_URL=${REDIS_URL}}
EOF
fi

  cp .env.test .env
  cp .env.test .env.local
}

# No need for override_database_url anymore - DATABASE_URL is set directly

main() {
  create_env_files
  echo "✅ Environment files created: .env.test, .env, .env.local"
  echo "   DATABASE_URL: ${DB_URL}"

  # Check for required secrets
  if [[ -z "${NEXT_PUBLIC_PRIVY_APP_ID:-}" && -z "${PRIVY_APP_ID:-}" ]]; then
    echo "❌ ERROR: NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_ID is required for tests."
    echo "Please set this secret in your GitHub repository."
    exit 1
  fi

  if [[ -z "${PRIVY_TEST_EMAIL:-}" ]]; then
    echo "❌ ERROR: PRIVY_TEST_EMAIL is required for E2E tests."
    echo "Please set this secret in your GitHub repository."
    exit 1
  fi
}

main "$@"

