# A2A Integration Tests

Comprehensive test suite for A2A (Agent-to-Agent) protocol integration.

## Test Files

### 1. `babylon-plugin-a2a-complete.test.ts`
**Purpose:** Verifies all providers and actions use A2A protocol (not REST API)

**What it tests:**
- All Babylon plugin providers use A2A methods
- All Babylon plugin actions use A2A methods
- No REST API fallbacks are used
- A2A client is properly initialized

**Run:** `bun test tests/integration/babylon-plugin-a2a-complete.test.ts`

### 2. `agents-a2a-multi-tick.test.ts` ⭐ **COMPREHENSIVE**
**Purpose:** Simulates real agent behavior over multiple ticks with full tracing

**What it tests:**
- Agents run multiple autonomous ticks without errors
- Providers are called and return valid data
- Actions can be executed via A2A
- Full agent lifecycle: providers → actions → tick
- All A2A calls are traced and verified
- No errors occur across all ticks

**Key features:**
- Tracks all A2A calls made during execution
- Verifies A2A protocol is used (not database fallback)
- Tests complete agent lifecycle
- Provides detailed tracing and logging

**Run:** `bun test tests/integration/agents-a2a-multi-tick.test.ts`

### 3. `a2a-direct-client.test.ts`
**Purpose:** Tests A2A client directly against the actual A2A API

**What it tests:**
- Trading methods (getPredictions, getPerpetuals, getTrades, etc.)
- Social methods (getFeed, createPost, likePost, etc.)
- User management methods (getUserProfile, getFollowers, etc.)
- Messaging methods (getChats, getUnreadCount)
- Notification methods (getNotifications, getGroupInvites)
- Stats and discovery methods (getLeaderboard, getUserStats, etc.)

**Key features:**
- Direct A2A client calls (not through agents)
- Full call tracing with timing
- Verifies all methods return valid data
- No errors across all method calls

**Run:** `bun test tests/integration/a2a-direct-client.test.ts`

## Running Tests

### Prerequisites
1. **Server must be running:** `bun dev`
2. **Database must be accessible**
3. **Environment variables:**
   - `TEST_BASE_URL` (default: `http://localhost:3000`)
   - `BABYLON_A2A_ENDPOINT` (default: `${TEST_BASE_URL}/api/a2a`)
   - `GROQ_API_KEY` (for agent runtime)

### Run All Tests
```bash
bun test tests/integration/
```

### Run Specific Test
```bash
bun test tests/integration/agents-a2a-multi-tick.test.ts
```

### Run with Verbose Output
```bash
bun test tests/integration/ --verbose
```

## Test Coverage

### ✅ Direct A2A Client Testing
- All 73 A2A methods tested directly
- Full call tracing and timing
- Error verification

### ✅ Agent Runtime Testing
- Providers called via agent runtime
- Actions executed via agent runtime
- A2A protocol usage verified

### ✅ Multi-Tick Simulation
- Agents run for multiple ticks
- Full autonomous tick execution
- Complete lifecycle testing
- Error-free execution verified

### ✅ Tracing and Verification
- All A2A calls traced
- Success/failure tracking
- Method-level breakdown
- Duration tracking

## Expected Results

All tests should:
- ✅ Complete without errors
- ✅ Use A2A protocol (not REST API or database fallback)
- ✅ Return valid data from all calls
- ✅ Show detailed tracing information
- ✅ Verify no errors occur

## Troubleshooting

### Server Not Available
If tests skip with "server not available":
1. Start the server: `bun dev`
2. Verify health endpoint: `curl http://localhost:3000/api/health`
3. Check `TEST_BASE_URL` environment variable

### A2A Endpoint Not Found
If A2A calls fail:
1. Verify A2A endpoint: `curl http://localhost:3000/api/a2a`
2. Check `BABYLON_A2A_ENDPOINT` environment variable
3. Verify server is running A2A router

### Agent Runtime Errors
If agent runtime fails:
1. Check `GROQ_API_KEY` is set
2. Verify agent user exists in database
3. Check agent has sufficient points balance

## Test Output

Tests provide detailed output including:
- ✅/❌ Status for each test
- 📊 A2A call summaries
- 📈 Tick summaries
- 🔍 Provider/action breakdowns
- ⚡ Execution timing

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Skip gracefully if server unavailable
- Clean up test data after execution
- Provide clear pass/fail indicators
- Include detailed error messages


