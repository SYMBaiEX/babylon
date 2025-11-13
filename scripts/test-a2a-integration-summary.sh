#!/bin/bash
# Quick A2A Integration Test
echo "🧪 Quick A2A Integration Test"
echo "=============================="
echo ""
echo "1. Testing Agent Card..."
curl -s http://localhost:3000/.well-known/agent-card | head -5
echo ""
echo "2. Testing Health Check..."
curl -s http://localhost:3000/api/a2a | jq -r '.service, .version, .status'
echo ""
echo "3. Testing Method Count..."
METHODS=$(curl -s http://localhost:3000/.well-known/agent-card | jq '.supportedMethods | length')
echo "   Supported Methods: $METHODS"
echo ""
echo "✅ A2A Integration Test Complete"
