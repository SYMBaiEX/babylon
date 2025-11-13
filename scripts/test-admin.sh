#!/bin/bash

# Admin Panel E2E Test Runner
# Convenience script for running admin panel tests

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Admin Panel E2E Test Runner        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Function to run tests
run_tests() {
    echo -e "${GREEN}Running $1...${NC}"
    npx playwright test "$2" "$3"
    echo ""
}

# Parse command line arguments
case "$1" in
    "panel")
        echo -e "${YELLOW}Testing: Admin Panel UI${NC}"
        run_tests "Admin Panel Tests" "tests/e2e/admin-panel.spec.ts"
        ;;
    "actions")
        echo -e "${YELLOW}Testing: Admin Actions${NC}"
        run_tests "Admin Actions Tests" "tests/e2e/admin-actions.spec.ts"
        ;;
    "ux")
        echo -e "${YELLOW}Testing: Admin UI/UX${NC}"
        run_tests "Admin UI/UX Tests" "tests/e2e/admin-ui-ux.spec.ts"
        ;;
    "all")
        echo -e "${YELLOW}Testing: All Admin Tests${NC}"
        run_tests "All Admin Tests" "tests/e2e/admin-panel.spec.ts" "tests/e2e/admin-actions.spec.ts" "tests/e2e/admin-ui-ux.spec.ts"
        ;;
    "ui")
        echo -e "${YELLOW}Running in UI Mode${NC}"
        npx playwright test --ui
        ;;
    "debug")
        echo -e "${YELLOW}Running in Debug Mode${NC}"
        if [ -z "$2" ]; then
            npx playwright test tests/e2e/admin-panel.spec.ts --debug
        else
            npx playwright test "tests/e2e/$2" --debug
        fi
        ;;
    "report")
        echo -e "${YELLOW}Generating Test Report${NC}"
        npx playwright test tests/e2e/admin-panel.spec.ts tests/e2e/admin-actions.spec.ts --reporter=html
        npx playwright show-report
        ;;
    "help"|"--help"|"-h")
        echo "Usage: ./scripts/test-admin.sh [command]"
        echo ""
        echo "Commands:"
        echo "  panel      Run admin panel UI tests"
        echo "  actions    Run admin actions tests"
        echo "  ux         Run UI/UX comprehensive tests"
        echo "  all        Run all admin tests (default)"
        echo "  ui         Run tests in UI mode"
        echo "  debug      Run tests in debug mode"
        echo "  report     Generate and show HTML report"
        echo "  help       Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./scripts/test-admin.sh all"
        echo "  ./scripts/test-admin.sh panel"
        echo "  ./scripts/test-admin.sh debug admin-panel.spec.ts"
        ;;
    *)
        # Default: run all tests
        echo -e "${YELLOW}Testing: All Admin Tests (default)${NC}"
        run_tests "All Admin Tests" "tests/e2e/admin-panel.spec.ts" "tests/e2e/admin-actions.spec.ts" "tests/e2e/admin-ui-ux.spec.ts"
        ;;
esac

echo -e "${GREEN}✅ Tests completed!${NC}"
echo ""
echo -e "${BLUE}For more options, run: ./scripts/test-admin.sh help${NC}"

