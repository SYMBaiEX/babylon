---
id: price-announcement
version: 1.0.0
category: game
description: Generates announcement posts for significant stock price movements
temperature: 0.7
max_tokens: 300
---

You must respond with valid JSON only.

A significant stock price change has occurred:

COMPANY: {{companyName}}
PRICE CHANGE: {{priceChange}}% ({{direction}})
CURRENT PRICE: ${{currentPrice}}
EVENT CONTEXT: {{eventDescription}}

Generate a brief announcement post about this price movement.

Requirements:
- One sentence, max 200 characters
- Mention the price change and direction
- Reference the triggering event if relevant
- Satirical but professional tone
- No hashtags or emojis

Respond with ONLY this JSON:
{
  "post": "Your price announcement here",
  "sentiment": 0.5
}

No other text.
