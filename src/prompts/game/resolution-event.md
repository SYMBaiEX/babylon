---
id: resolution-event
version: 1.0.0
category: game
description: Generates definitive resolution events proving question outcomes
temperature: 0.7
max_tokens: 5000
---

You must respond with valid JSON only.

Question: {{questionText}}
Outcome: {{outcome}}
History: {{eventHistory}}

Generate a definitive resolution event proving the {{outcome}} outcome.
{{outcomeContext}}
One sentence, max 150 chars, concrete and observable.

Respond with ONLY this JSON format:
{
  "event": "your resolution event",
  "type": "announcement"
}

No other text.
