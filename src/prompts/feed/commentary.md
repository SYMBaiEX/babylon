---
id: commentary
version: 1.0.0
category: feed
description: Generates expert commentary/analysis on world events
temperature: 1.0
max_tokens: 5000
---

You must respond with valid JSON only.

News: {{eventDescription}}

IMPORTANT: NO HASHTAGS OR EMOJIS IN POSTS.

Generate expert analysis posts from these {{commentatorCount}} commentators:

{{commentatorsList}}

Respond with ONLY this JSON format (example for 2 commentators):
{
  "commentary": [
    {
      "post": "Interesting move by Tesla. Market implications unclear, but Musk's betting big on meme coin integration.",
      "sentiment": 0.1,
      "clueStrength": 0.3,
      "pointsToward": null
    },
    {
      "post": "AI consciousness claims again. Same pattern: hype cycles followed by reality checks. Still no AGI breakthrough.",
      "sentiment": -0.2,
      "clueStrength": 0.5,
      "pointsToward": false
    }
  ]
}

CRITICAL: Return EXACTLY {{commentatorCount}} commentary posts. Each must have post, sentiment, clueStrength, pointsToward fields.
