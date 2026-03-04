# PostHog Agent Chat Tracking

Server-side event for agent chat so we can measure agent usage in PostHog.

## Event: `agent_message_sent`

Emitted when a user sends a message to an agent and the agent completes a response (single-agent chat or team chat).

**Where:** `apps/web/src/app/api/agents/[agentId]/chat/route.ts`  
**When:** After the response is written (DB + broadcast) and points are deducted, before returning the JSON response.

**distinctId:** `user.id` (the owner / human user).

**Properties:**

| Property       | Type    | Description                                      |
|----------------|---------|--------------------------------------------------|
| `agent_id`     | string  | Agent user id (the agent that replied).          |
| `message_id`   | string  | ID of the assistant response message.           |
| `use_pro`      | boolean | Whether the user requested the pro model.        |
| `points_cost`  | number  | Points deducted for this message (0 if LLM fail).|
| `model_used`   | string  | Model display name (e.g. free vs pro).           |

Tracking is best-effort: failures are logged and do not affect the API response.
