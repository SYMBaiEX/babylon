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
# Required for Linear integration (optional - feedback works without these)
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=           # Your team ID (see below)
LINEAR_GAME_FEEDBACK_LABEL_ID=  # Optional label ID (see below)
```

If not set, feedback still works but Linear issues aren't created.

### Finding Your Linear IDs

**LINEAR_TEAM_ID:**
1. Open Linear and go to Settings → Team → General
2. The team ID is in the URL: `linear.app/settings/teams/[TEAM_ID]`
3. Or use the API: `curl -H "Authorization: $LINEAR_API_KEY" https://api.linear.app/graphql -d '{"query":"{ teams { nodes { id name } } }"}'`

**LINEAR_GAME_FEEDBACK_LABEL_ID (optional):**
1. Create a label in Linear (e.g., "Game Feedback")
2. Get the ID via API:

   ```bash
   curl -H "Authorization: $LINEAR_API_KEY" https://api.linear.app/graphql \
     -d '{"query":"{ issueLabels { nodes { id name } } }"}'
   ```

3. Find your label in the response and copy the `id`

If `LINEAR_GAME_FEEDBACK_LABEL_ID` is not set, issues are created without labels.

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
