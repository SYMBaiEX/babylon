# Game Feedback Feature

## Status

| Issue | Status |
|-------|--------|
| [BAB-54](https://linear.app/eliza-labs/issue/BAB-54) | ✅ Done |
| [BAB-58](https://linear.app/eliza-labs/issue/BAB-58) | ✅ Done |

## Flow

```
User submits feedback → Saved to DB → Response returned → Linear issue created (async)
```

## Configuration

```bash
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=dbaea5df-7f3b-4747-b260-4aa5f6270228
```

If not set, feedback still works but Linear issues aren't created.

## Files

| File | Purpose |
|------|---------|
| `packages/api/src/linear/client.ts` | GraphQL client |
| `packages/api/src/linear/format-feedback.ts` | Feedback → Linear issue |
| `apps/web/src/app/api/feedback/game-feedback/route.ts` | API endpoint |
| `apps/web/src/components/feedback/GameFeedbackModal.tsx` | Modal UI |
| `apps/web/src/components/feedback/FeedbackButton.tsx` | Floating button |

## Linear Issue Format

**Title**: `[🐛 Bug] First 80 chars...`

**Description**:
```markdown
## Bug Report

### Description
User's description...

### Steps to Reproduce
1. Step 1
2. Step 2

### Screenshot
![Screenshot](https://...)

---

### Submission Details
- **Submitted by:** user@email.com
- **User ID:** `abc123`
- **Feedback ID:** `xyz789`
```

## Database

Feedback stored in `Feedback` table with:
- `interactionType`: `'general_game_feedback'`
- `category`: `'bug_report'` | `'feature_request'` | `'performance_issue'`
- `metadata`: JSON with `linearIssueId`, `linearIssueIdentifier`, `linearIssueUrl`
