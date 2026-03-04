# PostHog Analytics Audit

This document summarizes how PostHog is used in the repo and identifies gaps—especially around **agents** (prompting, trading on behalf of users) and **point purchase**—so you can fix or extend tracking.

---

## 1. PostHog architecture in this repo

| Layer | Location | Purpose |
|-------|----------|---------|
| **Browser client** | `apps/web/src/lib/posthog/client.ts` | Init with `NEXT_PUBLIC_POSTHOG_PROJECT_ID`, optional host override |
| **Server client** | `apps/web/src/lib/posthog/server.ts` | Singleton `posthog-node` for API routes; `trackServerEvent(distinctId, event, properties)` |
| **Provider** | `PostHogProvider` + `PostHogIdentifier` in `Providers.tsx` | Init client, `$pageview` on pathname change, identify logged-in user |
| **Hooks** | `apps/web/src/hooks/usePostHog.ts` | `track`, `trackAction`, `trackNavigation`, `trackClick`, `trackFormSubmit`, `trackError`; plus `useSignupTracking`, `useMarketTracking`, `useSocialTracking`, `usePerformanceTracking` |

All server events get `environment`, `deployment_url`, `app_version`, and `timestamp`. Server calls use `distinctId` (usually `userId`) so events align with the identified user in PostHog.

---

## 2. What is tracked today

### 2.1 User lifecycle & profile

- **Signup**: `signup_completed` (API), `alpha_group_assignment.success` / `alpha_group_assignment.failure`
- **Profile**: `profile_updated`, `social_account_linked`
- **Follow**: `user_followed`, `user_unfollowed`

### 2.2 Social & content

- **Posts**: `post_created`, `post_liked`, `post_unliked`, `post_shared`, `post_unshared`
- **Chat**: `dm_opened`, `message_sent` (DMs)

### 2.3 Markets (human-only via web API)

- **Predictions**: `prediction_bought`, `prediction_sold` — in `apps/web/src/app/api/markets/predictions/[id]/buy/route.ts` and `sell/route.ts`
- **Perps**: `trade_opened`, `trade_closed` — in `apps/web/src/app/api/markets/perps/open/route.ts` and `position/[id]/close/route.ts`

These fire only when the **Next.js API routes** are called. They use `user.userId` from `authenticate(request)`. So only **human-initiated** trades through the web app are tracked.

### 2.4 Point purchase

Two paths exist; event names differ.

| Path | Initiated event | Completed event | Where |
|------|------------------|-----------------|--------|
| **Stripe (card)** | `stripe_checkout_initiated` | `stripe_checkout_completed` | `api/stripe/checkout/session/route.ts`, `api/stripe/webhook/route.ts` |
| **x402 (on-chain)** | `points_purchase_initiated` | `points_purchase_completed` | `api/points/purchase/create-payment/route.ts`, `api/points/purchase/verify-payment/route.ts` |

So “point purchase” in PostHog is split: Stripe uses `stripe_checkout_*`, x402 uses `points_purchase_*`. Funnels or dashboards that treat “point purchase” as one flow need to combine both.

---

## 3. Gaps: agents

**No PostHog tracking** is used in any route under `apps/web/src/app/api/agents/`. So the following are **not** tracked today.

### 3.1 User prompting agents

- **Team chat message**  
  - `POST /api/agents/team-chat/message` — user sends a message to the team chat.  
  - No `trackServerEvent` (no “user sent message to agents” or “conversation started”).
- **Single-agent chat**  
  - `POST /api/agents/[agentId]/chat` — user sends a message to one agent.  
  - No `trackServerEvent` (no “user prompted agent” or “agent chat message”).
- **Coordinator**  
  - `POST /api/agents/team-chat/coordinator` — coordinator reply when no agent is tagged.  
  - No tracking.

So you cannot currently measure in PostHog:

- How many users prompt agents (team or single).
- Volume of agent conversations or messages.

**Recommendation:** Add server-side events such as:

- `agent_team_message_sent` (e.g. `userId`, `chatId`, optional `agentIds` if tagged).
- `agent_chat_message_sent` (e.g. `userId`, `agentId`, `isTeamChat` or channel).
- Optionally `agent_coordinator_replied` if you care about coordinator usage.

Use the same `userId` (owner) as `distinctId` so you can join with other events and identify “users who use agents”.

### 3.2 Agents trading on behalf of users

Agent trading does **not** go through the Next.js market API routes. It uses the same engine services (e.g. `PredictionMarketService.buy/sell`, perp open/close) but from:

- **Chat-initiated**: plugin-agent-core actions (e.g. `buy-prediction`, `sell-prediction`, `open-perp`, `close-perp`) and A2A/Babylon plugin actions call services **inside the agent runtime** with the agent’s `userId`.
- **Autonomous**: cron `POST /api/cron/agent-tick` runs the autonomous coordinator; agents trade via the same internal services.

So:

- `prediction_bought`, `prediction_sold`, `trade_opened`, `trade_closed` are **only** emitted when a **human** hits the web market API. They are **not** emitted when an agent trades (chat or cron).
- The cron route and the agent plugin code do not call `trackServerEvent`.

So in PostHog you cannot currently:

- Count trades executed by agents.
- Distinguish “user traded” vs “agent traded for user”.
- Attribute agent trades to the owning user (for LTV, engagement, etc.).

**Recommendation:**

1. **Option A – Instrument agent execution only**  
   In the agent plugin layer (e.g. after a successful buy/sell/open/close in `packages/agents/src/plugins/plugin-agent-core/src/actions/` or the A2A/Babylon trading actions), call a small shared helper that:
   - Accepts `agentUserId`, `ownerUserId`, `event` (e.g. `agent_prediction_bought`), and market/position props.
   - From the Next.js app, call `trackServerEvent(ownerUserId, event, { agentId: agentUserId, ... })` (e.g. via an internal API or a shared server-only module the app exposes).  
   That way you track “agent traded” with the **owner** as `distinctId` and `agentId` in properties.

2. **Option B – Instrument cron as well**  
   In `api/cron/agent-tick/route.ts`, after processing each agent (or batch), you could emit a summary event per agent or per run (e.g. `agent_tick_trades` with counts or high-level stats). That would require the cron route to have access to `trackServerEvent` and to know the mapping from agent id to owner id (which you already have in DB).

3. **Event naming**  
   Use distinct names from human trades, e.g. `agent_prediction_bought`, `agent_prediction_sold`, `agent_trade_opened`, `agent_trade_closed`, and always include `agentId` and optionally `trigger: 'chat' | 'autonomous'` so you can segment in PostHog.

---

## 4. Point purchase: is it tracked correctly?

- **Stripe path**: Initiated and completed are both tracked (`stripe_checkout_initiated`, `stripe_checkout_completed`) with `userId`, amount, points, session id. Correct.
- **x402 path**: Initiated is tracked (`points_purchase_initiated`). Completed is tracked in `verify-payment` (`points_purchase_completed`).

**Bug in verify-payment:**  
In `apps/web/src/app/api/points/purchase/verify-payment/route.ts`, the handler does **not** check `verificationResult` before continuing. It always:

1. Calls `getPaymentRequest(requestId)` (and uses `paymentRequest!.metadata`)
2. Calls `PointsService.purchasePoints(...)`
3. Calls `trackServerEvent(userId, 'points_purchase_completed', ...)`

So if verification fails, you still run the success path and emit `points_purchase_completed`, which is incorrect. You should only credit points and send `points_purchase_completed` when verification succeeded (e.g. when `verificationResult` indicates success). Fixing that will make point purchase completion tracking accurate for the x402 path.

---

## 5. Quick reference: where to add tracking

| Area | File(s) | Suggested event(s) |
|------|--------|--------------------|
| Team chat message | `api/agents/team-chat/message/route.ts` | `agent_team_message_sent` |
| Single-agent chat | `api/agents/[agentId]/chat/route.ts` | `agent_chat_message_sent` |
| Coordinator reply | `api/agents/team-chat/coordinator/route.ts` | optional `agent_coordinator_replied` |
| Agent prediction buy/sell | `packages/agents/.../buy-prediction.ts`, `sell-prediction.ts` (or shared wrapper) | `agent_prediction_bought`, `agent_prediction_sold` |
| Agent perp open/close | `packages/agents/.../open-perp.ts`, `close-perp.ts` (or shared wrapper) | `agent_trade_opened`, `agent_trade_closed` |
| x402 verify-payment | `api/points/purchase/verify-payment/route.ts` | Fix control flow so `points_purchase_completed` only fires on success |

---

## 6. Env and docs

- **Env**: `NEXT_PUBLIC_POSTHOG_PROJECT_ID`, optional `NEXT_PUBLIC_POSTHOG_HOST` (see `.env.example`).
- **Validation**: `scripts/validate-env.ts` warns if PostHog is not configured.
- **Types**: `packages/shared/src/types/common.ts` has `PostHogServerClient` / `PostHogClient` interfaces; `packages/testing/types/test-types.ts` has test doubles.

If you want, next steps can be: (1) add the agent events and (2) fix the verify-payment flow and optionally unify point-purchase event names for funnels.
