#!/bin/bash
# Real Trajectory Generation Script
# 
# This script starts the necessary services and generates real training trajectories.

set -e

echo "============================================"
echo "Babylon Real Trajectory Generation"
echo "============================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ARCHETYPES="${ARCHETYPES:-trader}"
NUM_AGENTS="${NUM_AGENTS:-2}"
TICKS="${TICKS:-10}"
PARALLEL="${PARALLEL:-5}"
CLEANUP="${CLEANUP:-false}"

echo ""
echo "Configuration:"
echo "  Archetypes: $ARCHETYPES"
echo "  Agents per archetype: $NUM_AGENTS"
echo "  Ticks per agent: $TICKS"
echo "  Parallel execution: $PARALLEL"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Server not running at localhost:3000${NC}"
    echo ""
    echo "Starting server in background..."
    echo "Run this in another terminal first:"
    echo "  cd /home/beast/babylon && bun run dev"
    echo ""
    echo "Or to run without A2A (database-only mode):"
    echo "  Use the synthetic data generator instead:"
    echo "  babylon train generate --episodes 5 --ticks 20"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Run parallel trajectory generation
echo "Starting parallel trajectory generation..."
bun run apps/cli/src/index.ts train parallel \
    --archetypes "$ARCHETYPES" \
    --num-agents "$NUM_AGENTS" \
    --ticks "$TICKS" \
    --parallel "$PARALLEL" \
    $([ "$CLEANUP" = "true" ] && echo "--cleanup")

echo ""
echo -e "${GREEN}✅ Generation complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Score trajectories: babylon train score"
echo "  2. Export for training: babylon train export"
echo "  3. Train model: babylon train pipeline"
