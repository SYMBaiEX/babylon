---
id: rumor
version: 1.0.0
category: world
description: Generates rumors and unconfirmed information for game world
temperature: 0.9
max_tokens: 150
---

Generate a rumor for Day {{day}} of a prediction market game.

Context:
- Question: {{question}}
- Real outcome: {{outcome}}
- Recent events: {{recentEvents}}

Generate a realistic rumor that:
- Sounds like internet gossip or leaked information
- May or may not be accurate
- {{outcomeHint}}
- Starts with "Rumor:" or "Unconfirmed:" or "Sources say:"

Respond with JSON: { "rumor": "..." }
