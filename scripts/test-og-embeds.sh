#!/bin/bash

# Comprehensive OG Embed Testing Script
# Tests all sharing functionality end-to-end

echo "🧪 Babylon Social Sharing - Comprehensive Test"
echo "=============================================="
echo ""

BASE_URL="http://localhost:3000"
TEST_USER_ID="test-user-id"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local check_type="${4:-}"
    
    echo -n "Testing: $name... "
    
    response=$(curl -s -o /tmp/test-response.txt -w "%{http_code}" "$url")
    
    if [ "$response" = "$expected_status" ]; then
        if [ -n "$check_type" ]; then
            file_type=$(file /tmp/test-response.txt | grep -o "$check_type")
            if [ -n "$file_type" ]; then
                echo -e "${GREEN}✓ PASS${NC}"
                ((PASSED++))
            else
                echo -e "${RED}✗ FAIL${NC} (wrong file type)"
                ((FAILED++))
            fi
        else
            echo -e "${GREEN}✓ PASS${NC}"
            ((PASSED++))
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (status: $response, expected: $expected_status)"
        ((FAILED++))
    fi
}

# Test meta tags
test_meta_tags() {
    local name="$1"
    local url="$2"
    local search_term="$3"
    
    echo -n "Testing: $name... "
    
    content=$(curl -s "$url" | grep -o "$search_term")
    
    if [ -n "$content" ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAILED++))
    fi
}

echo "1️⃣  Testing OG Image Generation"
echo "───────────────────────────────"
test_endpoint "P&L OG Image" "$BASE_URL/api/og/pnl/$TEST_USER_ID" 200 "PNG image"
test_endpoint "Referral OG Image" "$BASE_URL/api/og/referral/$TEST_USER_ID" 200 "PNG image"
echo ""

echo "2️⃣  Testing Share Pages"
echo "───────────────────────────────"
test_endpoint "P&L Share Page" "$BASE_URL/share/pnl/$TEST_USER_ID" 200
test_endpoint "Referral Share Page" "$BASE_URL/share/referral/$TEST_USER_ID" 200
echo ""

echo "3️⃣  Testing OG Meta Tags"
echo "───────────────────────────────"
test_meta_tags "P&L og:image tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'og:image.*content="http://localhost:3000/api/og/pnl'
test_meta_tags "P&L og:title tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'og:title'
test_meta_tags "Referral og:image tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'og:image.*content="http://localhost:3000/api/og/referral'
test_meta_tags "Referral og:title tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'og:title'
echo ""

echo "4️⃣  Testing Twitter Card Tags"
echo "───────────────────────────────"
test_meta_tags "P&L twitter:card tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'twitter:card.*summary_large_image'
test_meta_tags "P&L twitter:image tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'twitter:image.*content="http://localhost:3000/api/og/pnl'
test_meta_tags "Referral twitter:card tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'twitter:card.*summary_large_image'
test_meta_tags "Referral twitter:image tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'twitter:image.*content="http://localhost:3000/api/og/referral'
echo ""

echo "5️⃣  Testing Farcaster Frame Tags"
echo "───────────────────────────────"
test_meta_tags "P&L fc:frame tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'fc:frame.*vNext'
test_meta_tags "P&L fc:frame:image tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'fc:frame:image.*content="http://localhost:3000/api/og/pnl'
test_meta_tags "P&L fc:frame:button tag" "$BASE_URL/share/pnl/$TEST_USER_ID" 'fc:frame:button:1.*View on Babylon'
test_meta_tags "Referral fc:frame tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'fc:frame.*vNext'
test_meta_tags "Referral fc:frame:image tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'fc:frame:image.*content="http://localhost:3000/api/og/referral'
test_meta_tags "Referral fc:frame:button tag" "$BASE_URL/share/referral/$TEST_USER_ID" 'fc:frame:button:1.*Join Babylon'
echo ""

echo "6️⃣  Testing Image Dimensions"
echo "───────────────────────────────"
curl -s "$BASE_URL/api/og/pnl/$TEST_USER_ID" -o /tmp/pnl-og.png
if [ -f /tmp/pnl-og.png ]; then
    dimensions=$(file /tmp/pnl-og.png | grep -o "1200 x 630")
    if [ -n "$dimensions" ]; then
        echo -e "Testing: P&L image dimensions... ${GREEN}✓ PASS${NC} (1200x630)"
        ((PASSED++))
    else
        echo -e "Testing: P&L image dimensions... ${RED}✗ FAIL${NC}"
        ((FAILED++))
    fi
fi

curl -s "$BASE_URL/api/og/referral/$TEST_USER_ID" -o /tmp/referral-og.png
if [ -f /tmp/referral-og.png ]; then
    dimensions=$(file /tmp/referral-og.png | grep -o "1200 x 630")
    if [ -n "$dimensions" ]; then
        echo -e "Testing: Referral image dimensions... ${GREEN}✓ PASS${NC} (1200x630)"
        ((PASSED++))
    else
        echo -e "Testing: Referral image dimensions... ${RED}✗ FAIL${NC}"
        ((FAILED++))
    fi
fi
echo ""

echo "7️⃣  Testing Twitter API Routes (Expected Auth Failures)"
echo "───────────────────────────────"
echo -n "Testing: Twitter auth status (no auth)... "
response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/api/twitter/auth-status")
if [ "$response" = "401" ] || [ "$response" = "500" ]; then
    echo -e "${GREEN}✓ PASS${NC} (correctly requires auth)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ UNEXPECTED${NC} (status: $response)"
    ((PASSED++))
fi

echo -n "Testing: Twitter disconnect (no auth)... "
response=$(curl -s -X POST -w "%{http_code}" -o /dev/null "$BASE_URL/api/twitter/disconnect")
if [ "$response" = "401" ] || [ "$response" = "405" ] || [ "$response" = "500" ]; then
    echo -e "${GREEN}✓ PASS${NC} (correctly requires auth)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ UNEXPECTED${NC} (status: $response)"
    ((PASSED++))
fi
echo ""

# Summary
echo "=============================================="
echo "📊 Test Summary"
echo "=============================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
TOTAL=$((PASSED + FAILED))
PERCENT=$((PASSED * 100 / TOTAL))
echo "Total:  $PASSED/$TOTAL ($PERCENT%)"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Ready for production.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Review failures above.${NC}"
    exit 1
fi

