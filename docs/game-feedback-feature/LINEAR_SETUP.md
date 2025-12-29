# Linear Integration Setup Guide

## Overview

The game feedback system stores all submissions in the database. Additionally, it can **automatically create Linear issues** for each feedback submission when properly configured.

> **Note**: Feedback collection works without Linear configuration. Linear integration is optional but recommended for tracking and prioritization.

## Current Status

| Environment | Database Storage | Linear Sync |
|-------------|------------------|-------------|
| Local Dev   | ✅ Works         | ⚠️ Requires env vars |
| Staging     | ✅ Works         | ❌ Needs configuration |
| Production  | ✅ Works         | ❌ Needs configuration |

## Required Environment Variables

Add these to your Vercel project settings (or `.env` for local development):

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | Yes | Personal API key from Linear (starts with `lin_api_`) |
| `LINEAR_TEAM_ID` | Yes | UUID of your Linear team |
| `LINEAR_GAME_FEEDBACK_LABEL_ID` | No | UUID of a label to apply to all feedback issues |

## Step-by-Step Setup

### 1. Create a Linear API Key

1. Go to [Linear](https://linear.app)
2. Click your avatar → **Settings**
3. Navigate to **API** → **Personal API keys**
4. Click **Create key**
5. Give it a name (e.g., "Babylon Feedback Bot")
6. Copy the key (starts with `lin_api_`)

### 2. Find Your Team ID

**Option A: From URL**
1. Go to Linear → Settings → Team → General
2. The URL will be: `linear.app/settings/teams/[TEAM_ID]`
3. Copy the `TEAM_ID` (a UUID like `abc12345-1234-5678-abcd-123456789abc`)

**Option B: Using API**
```bash
curl -s -H "Authorization: lin_api_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{"query":"{ teams { nodes { id name } } }"}' | jq
```

Response:
```json
{
  "data": {
    "teams": {
      "nodes": [
        {
          "id": "abc12345-1234-5678-abcd-123456789abc",
          "name": "Your Team Name"
        }
      ]
    }
  }
}
```

### 3. (Optional) Create and Find a Label ID

If you want all feedback issues to have a specific label:

1. In Linear, go to **Settings** → **Labels**
2. Create a new label (e.g., "Game Feedback" with a distinctive color)
3. Get the label ID via API:

```bash
curl -s -H "Authorization: lin_api_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  https://api.linear.app/graphql \
  -d '{"query":"{ issueLabels { nodes { id name } } }"}' | jq
```

Find your label in the response and copy its `id`.

### 4. Configure Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

| Name | Value | Environments |
|------|-------|--------------|
| `LINEAR_API_KEY` | `lin_api_xxxxx...` | Production, Preview |
| `LINEAR_TEAM_ID` | `abc12345-1234-...` | Production, Preview |
| `LINEAR_GAME_FEEDBACK_LABEL_ID` | `def67890-...` (optional) | Production, Preview |

4. **Redeploy** your application for changes to take effect

## Verification

### Test the Integration

1. Log into the app
2. Click the green feedback button (bottom-right)
3. Submit a test feedback
4. Check Linear for the new issue

### Check Logs

If issues aren't appearing in Linear, check Vercel logs for:
- `"Linear integration disabled"` - API key missing or invalid format
- `"Linear issue creation failed"` - API error (check key permissions)
- `"Linear issue creation timed out"` - Network issue (will retry automatically)

### Admin Panel

View all feedback submissions at `/admin` → **Feedback** tab:
- See which submissions have Linear issues created
- Use **Retry Sync** for failed syncs

## Retry Failed Syncs

For feedback that was submitted before Linear was configured:

**Via Admin Panel:**
1. Go to `/admin` → **Feedback** tab
2. Filter by "No Linear Issue"
3. Click **Retry Sync** on each item

**Via API:**
```bash
curl -X POST "https://your-domain.com/api/admin/feedback/FEEDBACK_ID/retry-sync" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Submits Feedback                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/feedback/game-feedback                                │
│  ├── Validate & sanitize input                                   │
│  ├── Save to database (Feedback table)                           │
│  └── Return success immediately                                  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼ (async, fire-and-forget)
┌─────────────────────────────────────────────────────────────────┐
│  syncFeedbackToLinear()                                          │
│  ├── Check if LINEAR_API_KEY & LINEAR_TEAM_ID are set            │
│  ├── Format feedback as Linear issue                             │
│  ├── Create issue via Linear GraphQL API                         │
│  └── Update feedback metadata with issue ID/URL                  │
└─────────────────────────────────────────────────────────────────┘
```

## Linear Issue Format

Issues are created with structured formatting:

**Title:** `[🐛 Bug] First 80 characters of description...`

**Body:**
```markdown
## Bug Report

### Description
User's description of the issue...

### Steps to Reproduce
1. Step one
2. Step two
3. Step three

### Screenshot
![Screenshot](https://storage.url/screenshot.png)

---

### Submission Details
- **Submitted by:** user@email.com
- **User ID:** `usr_abc123`
- **Feedback ID:** `fb_xyz789`
- **Submitted at:** 2025-12-29T12:00:00Z
```

## Troubleshooting

### "Linear integration disabled" in logs
- Verify `LINEAR_API_KEY` starts with `lin_api_`
- Verify `LINEAR_TEAM_ID` is set
- Redeploy after adding env vars

### Issues not appearing in Linear
- Check the team ID is correct (issues may be in a different team)
- Verify API key has write permissions
- Check Vercel function logs for specific errors

### Rate limiting
- Linear API has rate limits
- The integration includes automatic retry with exponential backoff
- High-volume scenarios may need rate limiting on our side

## Security Notes

- API keys should never be committed to git
- Use Vercel's encrypted environment variables
- Consider using a service account API key rather than personal
- The API key needs `issues:write` permission at minimum
