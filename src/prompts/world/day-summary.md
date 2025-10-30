---
id: day-summary
version: 1.0.0
category: world
description: Generates one-line summaries of daily events
temperature: 0.6
max_tokens: 100
---

Generate a summary for Day {{day}}.

Context:
- Question: {{question}}
- Events today: {{eventsToday}}
- Real outcome: {{outcome}}

Generate a one-line summary that captures the day's key developments.

Respond with JSON: { "summary": "..." }
