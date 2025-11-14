#!/usr/bin/env bash

set -euo pipefail

echo "🧪 Emulating CI Environment Locally"
echo "===================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
  exit 1
fi

# Stop any existing test postgres container
echo -e "${YELLOW}🧹 Cleaning up existing test containers...${NC}"
docker stop ci-test-postgres 2>/dev/null || true
docker rm ci-test-postgres 2>/dev/null || true

# Start PostgreSQL container matching CI environment
echo -e "${YELLOW}🐘 Starting PostgreSQL container (matching CI)...${NC}"
docker run -d \
  --name ci-test-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  --health-cmd="pg_isready -U postgres" \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=5 \
  postgres:15

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
MAX_WAIT=30
WAITED=0

# Check if pg_isready is available, otherwise use docker exec
if command -v pg_isready > /dev/null 2>&1; then
  CHECK_CMD="pg_isready -h localhost -p 5432 -U postgres"
else
  CHECK_CMD="docker exec ci-test-postgres pg_isready -U postgres"
fi

until $CHECK_CMD > /dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${RED}❌ PostgreSQL failed to start within ${MAX_WAIT}s${NC}"
    docker logs ci-test-postgres
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
  echo -n "."
done
echo ""
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Set CI environment variables
export NODE_ENV=test
export CI=true
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_db"
export DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_db"
export REDIS_URL="redis://localhost:6379"

echo -e "${YELLOW}📊 Pushing database schema...${NC}"
bunx prisma db push --skip-generate --accept-data-loss

echo -e "${YELLOW}🔄 Regenerating Prisma client...${NC}"
bunx prisma generate

# Verify tables were created (optional, psql might not be installed)
echo -e "${YELLOW}✅ Verifying database schema...${NC}"
if command -v psql > /dev/null 2>&1; then
  psql "$DATABASE_URL" -c "\dt" || echo -e "${YELLOW}⚠️  Could not list tables${NC}"
else
  echo -e "${YELLOW}⚠️  psql not installed, skipping table verification${NC}"
fi

# Run the specific failing test
echo -e "${YELLOW}🧪 Running character-mapping tests...${NC}"
echo ""

if bun test tests/unit/world-facts/character-mapping.test.ts; then
  echo ""
  echo -e "${GREEN}✅ Character mapping tests passed!${NC}"
  
  # Optionally run all unit tests
  echo ""
  echo -e "${YELLOW}🧪 Running all unit tests...${NC}"
  if bun test tests/unit/; then
    echo ""
    echo -e "${GREEN}✅ All unit tests passed!${NC}"
  else
    echo ""
    echo -e "${RED}❌ Some unit tests failed${NC}"
    exit 1
  fi
else
  echo ""
  echo -e "${RED}❌ Character mapping tests failed${NC}"
  exit 1
fi

# Cleanup
echo ""
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
docker stop ci-test-postgres 2>/dev/null || true
docker rm ci-test-postgres 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ CI environment test completed successfully!${NC}"

