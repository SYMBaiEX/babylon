#!/bin/bash
# =============================================================================
# Comprehensive MCP & A2A Live Endpoint Tests
# Tests all endpoints against a live Babylon server
#
# Usage:
#   BASE_URL="https://play.babylon.market" API_KEY="bab_live_..." ./test-mcp-a2a-live.sh
# =============================================================================

set -uo pipefail

BASE_URL="${BASE_URL:-https://play.babylon.market}"
API_KEY="${API_KEY:-}"
AUTH_HEADER="X-Babylon-Api-Key"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Counters
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Helper function
test_endpoint() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data="${4:-}"
  local expected_status="${5:-200}"

  TOTAL=$((TOTAL + 1))

  local response
  local http_code
  local body

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" \
      -H "${AUTH_HEADER}: ${API_KEY}" \
      -H "Content-Type: application/json" \
      "${url}" 2>&1)
  else
    response=$(curl -s -w "\n%{http_code}" \
      -X POST \
      -H "${AUTH_HEADER}: ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d "${data}" \
      "${url}" 2>&1)
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_status" ]; then
    PASS=$((PASS + 1))
    # Check if this is an A2A response with task state
    local task_state=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('status',{}).get('state',''))" 2>/dev/null || echo "")
    if [ -n "$task_state" ] && [ "$task_state" != "" ]; then
      if [ "$task_state" = "completed" ]; then
        echo -e "  ${GREEN}PASS${NC} [$http_code] $name ${GREEN}(task: $task_state)${NC}"
      else
        echo -e "  ${YELLOW}WARN${NC} [$http_code] $name ${YELLOW}(task: $task_state)${NC}"
      fi
    else
      echo -e "  ${GREEN}PASS${NC} [$http_code] $name"
    fi
    # Show first 200 chars of response for debugging
    echo "$body" | cut -c1-200
    echo ""
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC} [$http_code expected:$expected_status] $name"
    echo "$body" | cut -c1-300
    echo ""
  fi
  echo ""
}

# Check API key
if [ -z "$API_KEY" ]; then
  echo -e "${RED}ERROR: API_KEY is required${NC}"
  echo "Usage: API_KEY='bab_live_...' BASE_URL='https://play.babylon.market' $0"
  exit 1
fi

echo -e "${BOLD}${CYAN}=============================================${NC}"
echo -e "${BOLD}${CYAN}  Babylon MCP & A2A Live Endpoint Tests${NC}"
echo -e "${BOLD}${CYAN}=============================================${NC}"
echo -e "Server: ${BLUE}${BASE_URL}${NC}"
echo -e "API Key: ${BLUE}${API_KEY:0:20}...${NC}"
echo ""

# =============================================================================
# SECTION 1: MCP ENDPOINTS
# =============================================================================
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${YELLOW}  1. MCP Protocol Endpoints${NC}"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1.1 MCP Service Discovery (GET)
echo -e "${CYAN}--- 1.1 MCP Service Discovery (GET /api/mcp) ---${NC}"
test_endpoint \
  "MCP Service Discovery" \
  "GET" \
  "${BASE_URL}/api/mcp"

# 1.2 MCP Initialize
echo -e "${CYAN}--- 1.2 MCP Initialize ---${NC}"
test_endpoint \
  "MCP Initialize" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "babylon-test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'

# 1.3 MCP Ping
echo -e "${CYAN}--- 1.3 MCP Ping ---${NC}"
test_endpoint \
  "MCP Ping" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "ping",
    "id": 2
  }'

# 1.4 MCP Tools List
echo -e "${CYAN}--- 1.4 MCP Tools List ---${NC}"
TOTAL=$((TOTAL + 1))
tools_response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "${AUTH_HEADER}: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 3
  }' \
  "${BASE_URL}/api/mcp" 2>&1)

tools_http_code=$(echo "$tools_response" | tail -n1)
tools_body=$(echo "$tools_response" | sed '$d')

if [ "$tools_http_code" = "200" ]; then
  tool_count=$(echo "$tools_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('result',{}).get('tools',[])))" 2>/dev/null || echo "?")
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC} [$tools_http_code] MCP Tools List - ${tool_count} tools available"

  # List first 10 tool names
  echo "$tools_body" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tools = d.get('result', {}).get('tools', [])
print(f'  First 15 tools:')
for t in tools[:15]:
    print(f'    - {t[\"name\"]}')
if len(tools) > 15:
    print(f'    ... and {len(tools) - 15} more')
" 2>/dev/null || echo "  (could not parse tool names)"
else
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC} [$tools_http_code] MCP Tools List"
  echo "$tools_body" | cut -c1-300
fi
echo ""

# 1.5 MCP Tool Call - get_markets (read-only, safe)
echo -e "${CYAN}--- 1.5 MCP Tool Call: get_markets ---${NC}"
test_endpoint \
  "MCP tools/call get_markets" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_markets",
      "arguments": {
        "limit": 5
      }
    },
    "id": 4
  }'

# 1.6 MCP Tool Call - get_balance
echo -e "${CYAN}--- 1.6 MCP Tool Call: get_balance ---${NC}"
test_endpoint \
  "MCP tools/call get_balance" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_balance",
      "arguments": {}
    },
    "id": 5
  }'

# 1.7 MCP Tool Call - get_user_profile
echo -e "${CYAN}--- 1.7 MCP Tool Call: get_user_profile ---${NC}"
test_endpoint \
  "MCP tools/call get_user_profile" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_user_profile",
      "arguments": {}
    },
    "id": 6
  }'

# 1.8 MCP Tool Call - query_feed
echo -e "${CYAN}--- 1.8 MCP Tool Call: query_feed ---${NC}"
test_endpoint \
  "MCP tools/call query_feed" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "query_feed",
      "arguments": {
        "limit": 5
      }
    },
    "id": 7
  }'

# 1.9 MCP Tool Call - get_leaderboard
echo -e "${CYAN}--- 1.9 MCP Tool Call: get_leaderboard ---${NC}"
test_endpoint \
  "MCP tools/call get_leaderboard" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_leaderboard",
      "arguments": {
        "limit": 5
      }
    },
    "id": 8
  }'

# 1.10 MCP Tool Call - search_users
echo -e "${CYAN}--- 1.10 MCP Tool Call: search_users ---${NC}"
test_endpoint \
  "MCP tools/call search_users" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_users",
      "arguments": {
        "query": "babylon"
      }
    },
    "id": 9
  }'

# 1.11 MCP Tool Call - get_positions
echo -e "${CYAN}--- 1.11 MCP Tool Call: get_positions ---${NC}"
test_endpoint \
  "MCP tools/call get_positions" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_positions",
      "arguments": {}
    },
    "id": 10
  }'

# 1.12 MCP Tool Call - get_trade_history
echo -e "${CYAN}--- 1.12 MCP Tool Call: get_trade_history ---${NC}"
test_endpoint \
  "MCP tools/call get_trade_history" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_trade_history",
      "arguments": {
        "limit": 5
      }
    },
    "id": 11
  }'

# 1.13 MCP Tool Call - get_notifications
echo -e "${CYAN}--- 1.13 MCP Tool Call: get_notifications ---${NC}"
test_endpoint \
  "MCP tools/call get_notifications" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_notifications",
      "arguments": {
        "limit": 5
      }
    },
    "id": 12
  }'

# 1.14 MCP Tool Call - get_chats
echo -e "${CYAN}--- 1.14 MCP Tool Call: get_chats ---${NC}"
test_endpoint \
  "MCP tools/call get_chats" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_chats",
      "arguments": {}
    },
    "id": 13
  }'

# 1.15 MCP Error Handling - Invalid Method
echo -e "${CYAN}--- 1.15 MCP Error: Invalid Method ---${NC}"
test_endpoint \
  "MCP Invalid Method (expected error)" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "invalid/method",
    "id": 14
  }'

# 1.16 MCP Error Handling - Invalid Tool
echo -e "${CYAN}--- 1.16 MCP Error: Invalid Tool Name ---${NC}"
test_endpoint \
  "MCP Invalid Tool (expected tool error)" \
  "POST" \
  "${BASE_URL}/api/mcp" \
  '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "nonexistent_tool",
      "arguments": {}
    },
    "id": 15
  }'

# 1.17 MCP Error - No Auth (POST should require auth)
echo -e "${CYAN}--- 1.17 MCP Error: No Auth on POST ---${NC}"
TOTAL=$((TOTAL + 1))
noauth_response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_balance","arguments":{}},"id":99}' \
  "${BASE_URL}/api/mcp" 2>&1)
noauth_code=$(echo "$noauth_response" | tail -n1)
noauth_body=$(echo "$noauth_response" | sed '$d')
if [ "$noauth_code" = "401" ] || [ "$noauth_code" = "403" ]; then
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC} [$noauth_code] MCP POST rejects unauthenticated requests"
else
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC} [$noauth_code expected:401/403] MCP POST should reject unauthenticated"
fi
echo "$noauth_body" | cut -c1-200
echo ""
echo ""

# =============================================================================
# SECTION 2: A2A ENDPOINTS
# =============================================================================
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${YELLOW}  2. A2A Protocol Endpoints${NC}"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 2.1 A2A Service Discovery (GET)
echo -e "${CYAN}--- 2.1 A2A Service Discovery (GET /api/a2a) ---${NC}"
test_endpoint \
  "A2A Service Discovery" \
  "GET" \
  "${BASE_URL}/api/a2a"

# 2.2 A2A Agent Card Discovery
echo -e "${CYAN}--- 2.2 A2A Agent Card (.well-known) ---${NC}"
test_endpoint \
  "A2A Agent Card (.well-known)" \
  "GET" \
  "${BASE_URL}/.well-known/agent-card.json"

# 2.3 A2A message/send - Get Balance (portfolio.get_balance)
echo -e "${CYAN}--- 2.3 A2A message/send: portfolio.get_balance ---${NC}"
test_endpoint \
  "A2A message/send portfolio.get_balance" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-bal-001",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "portfolio.get_balance"
            }
          }
        ]
      }
    },
    "id": "a2a-1"
  }'

# 2.4 A2A message/send - Get Feed (social.get_feed)
echo -e "${CYAN}--- 2.4 A2A message/send: social.get_feed ---${NC}"
test_endpoint \
  "A2A message/send social.get_feed" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-feed-002",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "social.get_feed",
              "params": { "limit": 5 }
            }
          }
        ]
      }
    },
    "id": "a2a-2"
  }'

# 2.5 A2A message/send - List Prediction Markets (markets.list_prediction)
echo -e "${CYAN}--- 2.5 A2A message/send: markets.list_prediction ---${NC}"
test_endpoint \
  "A2A message/send markets.list_prediction" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-mkts-003",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "markets.list_prediction",
              "params": { "limit": 5 }
            }
          }
        ]
      }
    },
    "id": "a2a-3"
  }'

# 2.6 A2A message/send - List Perpetual Markets (markets.list_perpetuals)
echo -e "${CYAN}--- 2.6 A2A message/send: markets.list_perpetuals ---${NC}"
test_endpoint \
  "A2A message/send markets.list_perpetuals" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-perp-004",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "markets.list_perpetuals",
              "params": { "limit": 5 }
            }
          }
        ]
      }
    },
    "id": "a2a-4"
  }'

# 2.7 A2A message/send - Get Market Prices (markets.get_market_prices)
echo -e "${CYAN}--- 2.7 A2A message/send: markets.get_market_prices ---${NC}"
test_endpoint \
  "A2A message/send markets.get_market_prices" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-mprice-005",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "markets.get_market_prices",
              "params": {}
            }
          }
        ]
      }
    },
    "id": "a2a-5"
  }'

# 2.8 A2A message/send - Search Users (users.search)
echo -e "${CYAN}--- 2.8 A2A message/send: users.search ---${NC}"
test_endpoint \
  "A2A message/send users.search" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-search-006",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "users.search",
              "params": { "query": "babylon" }
            }
          }
        ]
      }
    },
    "id": "a2a-6"
  }'

# 2.9 A2A message/send - Get Trades (markets.get_trades)
echo -e "${CYAN}--- 2.9 A2A message/send: markets.get_trades ---${NC}"
test_endpoint \
  "A2A message/send markets.get_trades" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-trades-007",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "markets.get_trades",
              "params": { "limit": 5 }
            }
          }
        ]
      }
    },
    "id": "a2a-7"
  }'

# 2.10 A2A message/send - Get Leaderboard (stats.leaderboard)
echo -e "${CYAN}--- 2.10 A2A message/send: stats.leaderboard ---${NC}"
test_endpoint \
  "A2A message/send stats.leaderboard" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-leader-008",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "stats.leaderboard",
              "params": { "limit": 5 }
            }
          }
        ]
      }
    },
    "id": "a2a-8"
  }'

# 2.11 A2A message/send - Get System Stats (stats.system)
echo -e "${CYAN}--- 2.11 A2A message/send: stats.system ---${NC}"
test_endpoint \
  "A2A message/send stats.system" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-stats-009",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "stats.system"
            }
          }
        ]
      }
    },
    "id": "a2a-9"
  }'

# 2.12 A2A message/send - Get Notifications (messaging.get_notifications)
echo -e "${CYAN}--- 2.12 A2A message/send: messaging.get_notifications ---${NC}"
test_endpoint \
  "A2A message/send messaging.get_notifications" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-notif-010",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "messaging.get_notifications",
              "params": { "limit": 5 }
            }
          }
        ]
      }
    },
    "id": "a2a-10"
  }'

# 2.13 A2A message/send - Get Chats (messaging.get_chats)
echo -e "${CYAN}--- 2.13 A2A message/send: messaging.get_chats ---${NC}"
test_endpoint \
  "A2A message/send messaging.get_chats" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-chats-011",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "messaging.get_chats"
            }
          }
        ]
      }
    },
    "id": "a2a-11"
  }'

# 2.14 A2A message/send - Get Positions (portfolio.get_positions)
echo -e "${CYAN}--- 2.14 A2A message/send: portfolio.get_positions ---${NC}"
test_endpoint \
  "A2A message/send portfolio.get_positions" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-pos-012",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "portfolio.get_positions"
            }
          }
        ]
      }
    },
    "id": "a2a-12"
  }'

# 2.15 A2A message/send - Get Trending Tags (stats.trending_tags)
echo -e "${CYAN}--- 2.15 A2A message/send: stats.trending_tags ---${NC}"
test_endpoint \
  "A2A message/send stats.trending_tags" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-tags-013",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "stats.trending_tags"
            }
          }
        ]
      }
    },
    "id": "a2a-13"
  }'

# 2.16 A2A message/send - Get Reputation (stats.get_reputation)
echo -e "${CYAN}--- 2.16 A2A message/send: stats.get_reputation ---${NC}"
test_endpoint \
  "A2A message/send stats.get_reputation" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-rep-014",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "stats.get_reputation"
            }
          }
        ]
      }
    },
    "id": "a2a-14"
  }'

# 2.17 A2A message/send - Get Organizations (stats.get_organizations)
echo -e "${CYAN}--- 2.17 A2A message/send: stats.get_organizations ---${NC}"
test_endpoint \
  "A2A message/send stats.get_organizations" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-orgs-015",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "operation": "stats.get_organizations"
            }
          }
        ]
      }
    },
    "id": "a2a-15"
  }'

# 2.18 A2A message/send via text (JSON in text part)
echo -e "${CYAN}--- 2.18 A2A message/send: Text JSON format ---${NC}"
test_endpoint \
  "A2A message/send text JSON format" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-text-016",
        "role": "user",
        "parts": [
          {
            "kind": "text",
            "text": "{\"operation\": \"stats.system\"}"
          }
        ]
      }
    },
    "id": "a2a-16"
  }'

# 2.19 A2A Error - Invalid JSON-RPC
echo -e "${CYAN}--- 2.19 A2A Error: Invalid JSON-RPC ---${NC}"
test_endpoint \
  "A2A Invalid JSON-RPC (expected error)" \
  "POST" \
  "${BASE_URL}/api/a2a" \
  '{
    "method": "test",
    "id": "a2a-err-1"
  }'

# 2.20 A2A Error - No Auth (POST should require auth)
echo -e "${CYAN}--- 2.20 A2A Error: No Auth on POST ---${NC}"
TOTAL=$((TOTAL + 1))
a2a_noauth=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"message/send","params":{"message":{"kind":"message","messageId":"noauth-test","role":"user","parts":[{"kind":"data","data":{"operation":"get_balance"}}]}},"id":"noauth"}' \
  "${BASE_URL}/api/a2a" 2>&1)
a2a_noauth_code=$(echo "$a2a_noauth" | tail -n1)
a2a_noauth_body=$(echo "$a2a_noauth" | sed '$d')
if [ "$a2a_noauth_code" = "401" ] || [ "$a2a_noauth_code" = "403" ]; then
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC} [$a2a_noauth_code] A2A POST rejects unauthenticated requests"
else
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC} [$a2a_noauth_code expected:401/403] A2A POST should reject unauthenticated"
fi
echo "$a2a_noauth_body" | cut -c1-200
echo ""
echo ""

# =============================================================================
# SECTION 3: AGENT DISCOVERY ENDPOINTS
# =============================================================================
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${YELLOW}  3. Agent Discovery Endpoints${NC}"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 3.1 Discover Agents
echo -e "${CYAN}--- 3.1 Agent Discovery (GET /api/agents/discover) ---${NC}"
test_endpoint \
  "Agent Discovery" \
  "GET" \
  "${BASE_URL}/api/agents/discover?limit=5"

# 3.2 Discover by Skills
echo -e "${CYAN}--- 3.2 Agent Discovery by Skills ---${NC}"
test_endpoint \
  "Agent Discovery by Skills" \
  "GET" \
  "${BASE_URL}/api/agents/discover?skills=trading&limit=5"

# 3.3 Discover by Type
echo -e "${CYAN}--- 3.3 Agent Discovery by Type ---${NC}"
test_endpoint \
  "Agent Discovery by Type" \
  "GET" \
  "${BASE_URL}/api/agents/discover?types=NPC&limit=5"

# 3.4 Agent Registry
echo -e "${CYAN}--- 3.4 Agent Registry (GET /api/registry/all) ---${NC}"
test_endpoint \
  "Agent Registry" \
  "GET" \
  "${BASE_URL}/api/registry/all"

# =============================================================================
# SECTION 4: HEALTH & MISC ENDPOINTS
# =============================================================================
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${YELLOW}  4. Health & Misc Endpoints${NC}"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 4.1 Health Check
echo -e "${CYAN}--- 4.1 Health Check ---${NC}"
TOTAL=$((TOTAL + 1))
health_response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/health" 2>&1)
health_code=$(echo "$health_response" | tail -n1)
health_body=$(echo "$health_response" | sed '$d')
if [ "$health_code" = "200" ]; then
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC} [$health_code] Health Check"
else
  FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC} [$health_code] Health Check"
fi
echo "$health_body" | cut -c1-200
echo ""
echo ""

# =============================================================================
# RESULTS SUMMARY
# =============================================================================
echo -e "${BOLD}${CYAN}=============================================${NC}"
echo -e "${BOLD}${CYAN}  TEST RESULTS SUMMARY${NC}"
echo -e "${BOLD}${CYAN}=============================================${NC}"
echo ""
echo -e "  Total:   ${BOLD}${TOTAL}${NC}"
echo -e "  ${GREEN}Passed:  ${PASS}${NC}"
echo -e "  ${RED}Failed:  ${FAIL}${NC}"
echo -e "  ${YELLOW}Skipped: ${SKIP}${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${BOLD}${GREEN}  All tests passed!${NC}"
else
  echo -e "${BOLD}${RED}  Some tests failed. See details above.${NC}"
fi
echo ""
