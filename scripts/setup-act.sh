#!/bin/bash
# Setup script for act (local GitHub Actions runner)
# https://github.com/nektos/act

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Setting up act for local CI testing${NC}"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check if act is installed
if ! command -v act &> /dev/null; then
    echo -e "${YELLOW}⚠️  act is not installed. Installing...${NC}"
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install act
        else
            echo -e "${RED}❌ Homebrew not found. Please install act manually:${NC}"
            echo "   brew install act"
            echo "   or: curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
    else
        echo -e "${RED}❌ Unsupported OS. Please install act manually:${NC}"
        echo "   https://github.com/nektos/act#installation"
        exit 1
    fi
fi
echo -e "${GREEN}✓ act is installed: $(act --version)${NC}"

# Check if .secrets.local exists
if [ ! -f .secrets.local ]; then
    echo ""
    echo -e "${YELLOW}📋 Creating .secrets.local from template...${NC}"
    
    if [ -f .secrets.local.template ]; then
        cp .secrets.local.template .secrets.local
        echo -e "${GREEN}✓ Created .secrets.local${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  IMPORTANT: Edit .secrets.local and add your actual secrets!${NC}"
        echo "   You can copy values from your .env.local file."
    else
        echo -e "${RED}❌ .secrets.local.template not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .secrets.local exists${NC}"
fi

# Pull the Docker images (speeds up first run)
echo ""
echo -e "${BLUE}📥 Pulling Docker images (this may take a while on first run)...${NC}"
docker pull catthehacker/ubuntu:act-latest || true
docker pull postgres:16-alpine || true
docker pull redis:7-alpine || true
echo -e "${GREEN}✓ Docker images ready${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Available commands:"
echo "  ${BLUE}bun run test${NC}        - Run local CI pipeline (like GitHub Actions)"
echo "  ${BLUE}bun run test:fast${NC}   - Run unit + integration tests directly"
echo "  ${BLUE}bun run test:act${NC}    - Alias for 'bun run test'"
echo "  ${BLUE}bun run test:act:ci${NC} - Run the full ci.yml workflow locally"
echo "  ${BLUE}bun run test:act:full${NC} - Run unit+integration CI workflow"
echo "  ${BLUE}bun run test:act:list${NC} - List available workflows/jobs"
echo ""
echo "Tips:"
echo "  • First run may be slow (downloading Docker images)"
echo "  • Edit .secrets.local to add API keys for full test coverage"
echo "  • Use 'bun run test:fast' for quick iteration (no Docker)"
echo ""





