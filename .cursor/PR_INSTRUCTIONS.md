# PR Creation Instructions for Cloud Cursor Agent

## Overview
When creating a Pull Request, you MUST follow these guidelines to ensure proper code ownership, review, and quality standards.

## Step 1: Determine Code Owners

Before creating a PR, identify which files have changed and determine the appropriate code owners using `.github/CODEOWNERS`:

### Code Owner Mapping

**Agents (runtime / A2A / MCP)** → `@wtfsayo`
- `/packages/agents/`, `/packages/a2a/`, `/packages/mcp/`
- `/apps/web/src/app/agents/`, `/apps/web/src/app/api/agents/`, `/apps/web/src/app/api/a2a/`
- `/apps/web/src/app/api/agent-templates/`, `/apps/web/src/app/mcp/`
- `/apps/web/src/components/agents/`, `/apps/web/public/agent-templates/`
- `/apps/web/src/app/api/cron/agent-tick/`

**Markets + Trading + Privy** → `@slkzgm`
- `/packages/core/markets/`, `/packages/contracts/src/prediction-markets/`
- `/apps/web/src/app/markets/`, `/apps/web/src/app/betting/`
- `/apps/web/src/components/markets/`, `/apps/web/src/components/trades/`
- `/apps/web/src/app/api/markets/`, `/apps/web/src/app/api/trades/`, `/apps/web/src/app/api/questions/`
- `/apps/web/src/app/api/cron/perp-funding/`
- Privy auth files: `/packages/shared/src/auth/privy-config.ts`, `/packages/shared/src/auth/wallet-utils.ts`
- `/apps/web/src/hooks/useAuth.ts`, `/apps/web/src/hooks/useSmartWallet.ts`
- `/apps/web/src/app/api/auth/` (general auth, overridden for Discord/Farcaster)

**Game Engine Core** → `@SYMBaiEX`
- `/packages/engine/`
- `/apps/web/src/app/game/`, `/apps/web/src/app/api/game/`, `/apps/web/src/app/api/npc/`
- `/apps/web/src/components/npc/`
- `/apps/web/src/app/api/cron/game-tick/`, `/apps/web/src/app/api/cron/world-facts/`

**RL / Training** → `@SYMBaiEX` (temporary, should be `@revlentless` when added)
- `/packages/training/`
- `/apps/web/src/app/admin/rl-training/`
- `/apps/web/src/app/api/training/`, `/apps/web/src/app/api/_training/`, `/apps/web/src/app/api/huggingface/`
- `/apps/web/src/app/api/admin/training/`, `/apps/web/src/app/api/admin/training-data/`, `/apps/web/src/app/api/admin/ai-models/`
- Training cron jobs: `/apps/web/src/app/api/cron/training/`, `/apps/web/src/app/api/cron/training-check/`, etc.

**Discord Bot / Automations** → `@SYMBaiEX` (temporary, should be `@odilitime` when added)
- `/apps/web/src/app/api/auth/discord/`
- `/apps/web/src/app/api/users/[userId]/verify-discord-join/`

**Chats** → `@tcm390`
- `/apps/web/src/app/chats/`, `/apps/web/src/app/api/chats/`
- `/apps/web/src/components/chat/`, `/apps/web/src/components/chats/`
- `/apps/web/src/app/api/realtime/token/`
- `/packages/db/src/schema/messaging.ts`
- `/packages/api/src/realtime/`, `/packages/api/src/sse/`
- Chat-related test files

**Farcaster Mini App** → `@xR0am`
- `/apps/web/public/farcaster.json`, `/apps/web/next.config.ts`
- `/apps/web/src/components/providers/FarcasterMiniAppProvider.tsx`
- `/apps/web/src/app/api/frame/`, `/apps/web/src/app/api/embed/post/`
- `/apps/web/src/app/api/auth/farcaster/`, `/apps/web/src/app/api/auth/onboarding/farcaster/`
- `/apps/web/src/app/api/users/[userId]/verify-farcaster-follow/`
- `/apps/web/src/hooks/useSocialVerification.ts` (shared with `@SYMBaiEX` - temporary fallback for `@odilitime`)
- `/apps/web/src/stores/authStore.ts`
- `/packages/shared/src/auth/farcaster-auth-client.ts`, `/packages/shared/src/auth/farcaster-onboarding.ts`

### How to Determine Owners
1. List all changed files in your PR
2. Match each file path against CODEOWNERS patterns (last match wins)
3. Collect unique code owners
4. Request review from all relevant owners

## Step 2: PR Structure and Template

Use `.github/pull_request_template.md` as the base. Fill out ALL sections:

### Required Sections

1. **Summary** (1-3 bullets)
   - What changed + why
   - User impact / business goal

2. **Type** (check one)
   - Feature, Bug fix, Refactor, Performance, Infra/ops, Docs, Contracts/on-chain, Other

3. **Context / Links**
   - Link issues, Linear tickets, docs, prior PRs

4. **Scope** (keep it focused)
   - Confirm PR is focused on single change/theme
   - List areas touched (checkboxes):
     - Web UI (`apps/web`)
     - Web API routes / SSE / A2A (`apps/web`)
     - CLI (`apps/cli`)
     - Docs site (`apps/docs`) / vendor docs (`docs/vendors/*`)
     - Domain / game engine (`packages/engine`, `packages/core/*`)
     - Agents / runtime / A2A / MCP (`packages/agents`, `packages/a2a`, `packages/mcp`)
     - API infra (`packages/api`)
     - DB (`packages/db`)
     - Contracts / on-chain (`packages/contracts`)
     - Shared types/utils (`packages/shared`)
     - Tests (`packages/testing`)
   - Note drive-by refactors excluded or split

5. **Changes**
   - List notable changes (new/removed/modified)
   - Link key files if helpful

6. **Review guide**
   - Where reviewers should start
   - Risk level (Low/Medium/High)
   - Notes for reviewers

7. **Test plan**
   - Commands run (checkboxes):
     - `bun run check` (Biome format)
     - `bun run typecheck`
     - `bun run lint`
     - `bun run build`
     - `bun run test` (unit + integration)
     - `bun run test:e2e` (if critical flows changed)
     - `bun run contracts:test` (if contracts changed)
     - `bun run db:check` (if DB schema/queries changed)
   - Manual verification steps

8. **Ops / Migration / Deployment**
   - Deploy impact
   - Env var updates (must update `.env.example` if env changed)
   - DB migrations (`bun run db:migrate`) / backfill / seed
   - Cron changes (`vercel.json`, `CRON_SECRET`, etc.)
   - Rollout plans (behind flag / gradual rollout)

9. **Breaking changes**
   - None or describe with migration guide

10. **Security / privacy**
    - No impact or needs extra review

11. **Area-specific notes** (expand if relevant)
    - **API / contracts between services**: New/changed endpoints, SSE event payloads, shared types
    - **Database**: Tables/columns/indexes, perf implications, how to verify
    - **Contracts / on-chain**: Network(s), addresses, upgrade/migration notes, how to verify
    - **Docs**: If you touched generated vendor docs, regenerate via `bun run docs:generate`

12. **Screenshots / recordings** (REQUIRED when available)
    - **ALWAYS include screenshots or video recordings** if:
      - UI changes are made (before/after screenshots)
      - User-facing features are added/modified
      - Visual changes occur (styling, layout, components)
      - Interactive flows are changed
    - For video recordings: Keep them short and focused (15-60 seconds)
    - For screenshots: Include both before/after when applicable
    - If no visual changes: Note "No UI changes" explicitly

13. **Checklist (author)**
    - Self-review done
    - Base branch correct (`staging` by default)
    - **Screenshots/video included** (if UI/visual changes exist)
    - Handlers thin and portable
    - Domain logic in packages
    - `.env.example` updated (if env changed) and variables documented above
    - Docs updated (and `bun run docs:generate` if vendor docs changed)
    - Tests added/updated for behavior changes (or rationale provided)
    - Dependencies intentional
    - Code owners requested

## Step 3: PR Creation Process

### Before Creating PR

1. **Run all checks** (from test plan):
   ```bash
   bun run check
   bun run typecheck
   bun run lint
   bun run build
   bun run test
   # Add others as needed based on changes
   ```

2. **Capture screenshots/video** (REQUIRED):
   - **If UI changes exist**: Take screenshots or record video
   - **Before/after screenshots**: Show the difference clearly
   - **Video recordings**: Capture key user flows (keep under 60 seconds)
   - **Save files**: Store in a location accessible for PR (e.g., drag-drop to GitHub)
   - **If no visual changes**: Document this explicitly in PR description

3. **Verify code quality**:
   - Handlers are thin (validate → service → map errors)
   - Domain logic is in packages (not Next/React/Elysia coupling)
   - No defensive programming (no try/catch, no `if (obj.property === 'function')`)
   - Clean code, fail fast
   - No `unknown` or `any` types (research proper types)

4. **Check base branch**: Default is `staging`

### Creating the PR

1. **Title**: Clear, descriptive, follows conventional commits if applicable
2. **Description**: Use the PR template, fill out ALL sections
3. **Base branch**: `staging` (unless explicitly different)
4. **Reviewers**: 
   - Add code owners based on changed files (from CODEOWNERS)
   - GitHub may auto-request via CODEOWNERS, but verify
   - If multiple owners, request all relevant ones

### PR Best Practices

- **Keep PRs focused**: One theme/change per PR
- **Avoid catch-all PRs**: Split if touching multiple unrelated areas
- **Exclude drive-by refactors**: Split into separate PR or explicitly note
- **Document non-goals**: List follow-ups separately
- **Link related work**: Issues, Linear tickets, prior PRs
- **Provide context**: Help reviewers understand why, not just what
- **ALWAYS include visuals**: Screenshots or video recordings for any UI/visual changes (mandatory)

## Step 4: Post-Creation Verification

After creating the PR:

1. Verify all required sections are filled
2. **Confirm screenshots/video are attached** (if UI/visual changes exist)
3. Confirm code owners are requested as reviewers
4. Check that test plan checkboxes reflect what was actually run
5. Ensure base branch is correct (`staging`)
6. Verify CI checks are running/passing

## Example Workflow

```bash
# 1. Determine changed files
git diff --name-only staging

# 2. Match against CODEOWNERS to find owners
# Example: Changed /apps/web/src/app/markets/ → @slkzgm

# 3. Run checks
bun run check
bun run typecheck
bun run lint
bun run build
bun run test

# 4. Capture visuals (if UI changes)
# - Take screenshots or record video of the new feature
# - Save for PR attachment

# 5. Create PR with:
# - Base: staging
# - Title: "feat: add market filtering UI"
# - Description: Fill out PR template completely (include screenshots/video)
# - Reviewers: @slkzgm (from CODEOWNERS)
```

## Important Notes

- **CODEOWNERS patterns**: Last match wins if multiple patterns match
- **Temporary owners**: Some areas have temporary owners (noted in CODEOWNERS comments)
- **Shared ownership**: Some files have multiple owners (e.g., `useSocialVerification.ts` has `@xR0am @SYMBaiEX`)
- **Area-specific notes**: Use the collapsible `<details>` section for API/contracts, Database, Contracts/on-chain, or Docs changes
- **DB migrations**: Use `bun run db:migrate` (not `db:push`) for production migrations
- **Cron changes**: Document changes to `vercel.json` and `CRON_SECRET` in ops section
- **Always request review**: Even if CODEOWNERS auto-requests, verify reviewers are correct
- **Complete template**: Don't leave placeholder text, fill out all relevant sections
- **Visual documentation**: ALWAYS include screenshots or video recordings when UI/visual changes are made - this is mandatory, not optional

