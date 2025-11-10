# Feedback System Testing Guide

This guide explains how to test the feedback system to ensure it's working properly.

## Overview

The feedback system includes:
1. **Auto-generated trade feedback** - Generated when positions are resolved
2. **Auto-generated game feedback** - Generated when games complete
3. **Manual feedback** - Users can submit feedback with scores/ratings
4. **Feedback metrics** - Aggregated performance metrics based on feedback

## Quick Start

### Run Automated Tests

```bash
# Run unit tests for feedback calculations
bun test tests/unit/feedback-calculations.test.ts

# Run integration tests for feedback APIs
bun test tests/integration/feedback-api.test.ts

# Run all feedback tests
bun test tests/**/*feedback*
```

### Run Manual Test Script

```bash
# Run comprehensive manual test script
bun run scripts/test-feedback.ts

# Run with cleanup (removes test data after)
bun run scripts/test-feedback.ts --cleanup
```

## Testing Scenarios

### 1. Auto-Generated Trade Feedback

**What it tests:**
- Feedback generation for profitable trades
- Feedback generation for unprofitable trades
- Score calculation based on ROI, timing, and risk
- Comment generation based on score ranges
- Metrics updates after feedback

**How to test:**

```bash
# Via API
curl -X POST http://localhost:3000/api/feedback/auto-generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "trade",
    "agentId": "USER_ID_HERE",
    "tradeId": "trade_123",
    "metrics": {
      "profitable": true,
      "roi": 0.5,
      "holdingPeriod": 24,
      "timingScore": 0.8,
      "riskScore": 0.7
    }
  }'
```

**Expected results:**
- Feedback record created with score 60-100 for profitable trades
- Comment reflects performance level
- Metadata includes trade details
- Agent metrics updated

### 2. Auto-Generated Game Feedback

**What it tests:**
- Feedback generation for completed games
- Score calculation based on PNL, decisions, risk management
- Win/loss bonus in scoring
- Game metrics updates

**How to test:**

```bash
# Via API
curl -X POST http://localhost:3000/api/feedback/auto-generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "game",
    "agentId": "USER_ID_HERE",
    "gameId": "game_123",
    "metrics": {
      "won": true,
      "pnl": 500,
      "positionsClosed": 5,
      "finalBalance": 1500,
      "startingBalance": 1000,
      "decisionsCorrect": 8,
      "decisionsTotal": 10,
      "riskManagement": 0.8
    }
  }'
```

**Expected results:**
- Feedback record created with appropriate score
- Game metrics (gamesPlayed, gamesWon) updated
- Average game score calculated

### 3. Manual Feedback Submission

**What it tests:**
- User-to-user feedback submission
- Score and star rating conversion
- Comment storage
- Validation (no self-feedback)

**How to test:**

```bash
# Via API
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "USER_1_ID",
    "toUserId": "USER_2_ID",
    "stars": 5,
    "comment": "Excellent performance!",
    "category": "trade_performance"
  }'
```

**Expected results:**
- Feedback record created
- 5 stars converted to 100 score
- Comment stored
- Receiver's metrics updated

### 4. Integration with Game Engine

**What it tests:**
- Automatic feedback generation when positions resolve
- Batch processing of multiple positions
- Error handling for failed feedback generation

**How to test:**

1. Create a position in a market
2. Resolve the market (via game tick or manual)
3. Check that feedback was generated:

```sql
SELECT * FROM "Feedback" 
WHERE "toUserId" = 'USER_ID' 
AND "category" = 'trade_performance'
ORDER BY "createdAt" DESC
LIMIT 10;
```

**Expected results:**
- Feedback generated for each resolved position
- Scores calculated based on position PNL
- Metrics updated for each user

## Verification Checklist

After running tests, verify:

- [ ] Feedback records are created in database
- [ ] Scores are calculated correctly (0-100 range)
- [ ] Comments match score ranges:
  - 80+: "Excellent"
  - 60-79: "Good"
  - 40-59: "Moderate"
  - <40: "Challenging"
- [ ] AgentPerformanceMetrics are updated:
  - `totalFeedbackCount` increases
  - `averageFeedbackScore` recalculated
  - `totalTrades` or `gamesPlayed` updated
- [ ] Metadata stored correctly:
  - Trade feedback: `tradeId`, `profitable`, `roi`, `holdingPeriod`
  - Game feedback: `gameId`, `won`, `pnl`, `decisionsCorrect`
- [ ] No duplicate feedback for same trade/game
- [ ] Error handling works (invalid users, missing data)

## Database Queries for Verification

```sql
-- Check recent feedback
SELECT 
  id,
  "toUserId",
  score,
  category,
  comment,
  "interactionType",
  metadata,
  "createdAt"
FROM "Feedback"
ORDER BY "createdAt" DESC
LIMIT 20;

-- Check feedback metrics
SELECT 
  "userId",
  "totalFeedbackCount",
  "averageFeedbackScore",
  "totalTrades",
  "gamesPlayed",
  "reputationScore"
FROM "AgentPerformanceMetrics"
ORDER BY "updatedAt" DESC
LIMIT 10;

-- Check feedback by category
SELECT 
  category,
  COUNT(*) as count,
  AVG(score) as avg_score,
  MIN(score) as min_score,
  MAX(score) as max_score
FROM "Feedback"
GROUP BY category;
```

## Troubleshooting

### Feedback not generating

1. Check logs for errors:
   ```bash
   # Look for AutoFeedback log entries
   grep "AutoFeedback" logs/*.log
   ```

2. Verify user exists:
   ```sql
   SELECT id, username FROM "User" WHERE id = 'USER_ID';
   ```

3. Check position status:
   ```sql
   SELECT id, "userId", status, pnl FROM "Position" 
   WHERE status = 'resolved' 
   ORDER BY "resolvedAt" DESC;
   ```

### Scores seem incorrect

1. Verify metrics calculation:
   - ROI should be between -0.5 and 1.0
   - Timing score should be 0-1
   - Risk score should be 0-1

2. Check score calculation function:
   ```typescript
   import { calculateTradeScore } from '@/lib/reputation/reputation-service'
   const score = calculateTradeScore(metrics)
   console.log('Calculated score:', score)
   ```

### Metrics not updating

1. Check if `updateFeedbackMetrics` is being called
2. Verify transaction isn't rolling back
3. Check for database constraints/errors

## Performance Testing

For load testing feedback generation:

```bash
# Generate multiple feedback entries
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/feedback/auto-generate \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"trade\",
      \"agentId\": \"USER_ID\",
      \"tradeId\": \"trade_$i\",
      \"metrics\": {
        \"profitable\": true,
        \"roi\": 0.3,
        \"holdingPeriod\": 24,
        \"timingScore\": 0.7,
        \"riskScore\": 0.6
      }
    }"
done
```

Monitor:
- Database query performance
- Memory usage
- Error rates

