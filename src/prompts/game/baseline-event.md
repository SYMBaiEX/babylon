---
id: baseline-event
version: 1.0.0
category: game
description: Generates normal, mundane baseline events for genesis game
temperature: 0.7
max_tokens: 5000
---

You must respond with valid JSON only.

Date: {{dateStr}}
Event type: {{eventType}}
Involved: {{actorDescriptions}}

Generate a normal, mundane baseline event. One sentence, max 100 chars.

Respond with ONLY this JSON format:
{"event": "your event description"}

No other text.
