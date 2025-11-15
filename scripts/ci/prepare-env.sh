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
NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-test-secret-key}
PRIVY_APP_ID=${PRIVY_APP_ID:-}
PRIVY_APP_SECRET=${PRIVY_APP_SECRET:-}
NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID:-${PRIVY_APP_ID:-}}
PRIVY_TEST_EMAIL=${PRIVY_TEST_EMAIL:-}
PRIVY_TEST_PHONE=${PRIVY_TEST_PHONE:-}
PRIVY_TEST_OTP=${PRIVY_TEST_OTP:-}
PRIVY_TEST_PASSWORD=${PRIVY_TEST_PASSWORD:-}

# API Keys
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
}

main "$@"

